"use server";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { ownsAttempt } from "@/lib/auth/ownership";
import { ADMIN_USER_ID, requireUserId } from "@/lib/auth/session";
import { viewerForAttempt, viewerForQuiz, type Viewer } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import {
  answers,
  attempts,
  questions,
  type AnswerResponse,
  type QuestionAnswer,
  type Verdict,
} from "@/lib/db/schema";
import { LlmError, toLlmError } from "@/lib/llm";
import { gradeShortAnswers } from "@/lib/quiz/grading";
import { attemptScore, scoreObjective } from "@/lib/quiz/scoring";
import { planAttempt } from "@/lib/quiz/shuffle";
import { awardBadges } from "@/lib/game/award";
import { recordReviews } from "@/lib/srs/store";
import { sourceLinks } from "@/lib/source-links";
import { fail, ok, type ActionResult } from "./result";

const ResponseSchema: z.ZodType<AnswerResponse> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mcq"), choice: z.number().int().min(0).nullable() }),
  z.object({ type: z.literal("multi"), choices: z.array(z.number().int().min(0)) }),
  z.object({ type: z.literal("tf"), choice: z.boolean().nullable() }),
  z.object({ type: z.literal("short"), text: z.string().max(5000) }),
  z.object({ type: z.literal("blank"), text: z.string().max(500) }),
]);

/** Ignore absurd deltas (e.g. a laptop that slept with the tab open). */
const clampDelta = (ms: number) => Math.max(0, Math.min(ms, 30 * 60 * 1000));

export async function startAttempt(
  quizId: string,
  mode: "practice" | "exam",
  timeLimitMin: number | null,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await viewerForQuiz(quizId);
  if (!viewer) return fail("Quiz introuvable");
  const qs = db
    .select({ id: questions.id, type: questions.type, options: questions.options })
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.deletedAt)))
    .orderBy(asc(questions.ord))
    .all();
  if (!qs.length) return fail("Ce quiz n'a aucune question");
  const plan = planAttempt(qs, Math.floor(Math.random() * 2 ** 31));
  const limit = mode === "exam" && timeLimitMin ? Math.round(Math.min(Math.max(timeLimitMin, 1), 300) * 60) : null;
  const row = db
    .insert(attempts)
    .values({
      quizId,
      mode,
      timeLimitSec: limit,
      questionOrder: plan.questionOrder,
      optionOrders: plan.optionOrders,
      playerId: viewer.kind === "player" ? viewer.playerId : null,
    })
    .returning({ id: attempts.id })
    .get();
  return ok(row);
}

export type Reveal = {
  score: number;
  verdict: Verdict;
  comment: string | null;
  answer: QuestionAnswer;
  explanation: string;
  excerpt: string;
  sectionPath: string;
  sourceHref: string | null;
};

async function getOpenAttempt(attemptId: string) {
  const viewer = await viewerForAttempt(attemptId);
  if (!viewer) return { error: "Tentative introuvable" } as const;
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt) return { error: "Tentative introuvable" } as const;
  if (attempt.finishedAt) return { error: "Cette tentative est déjà terminée" } as const;
  return { attempt, userId: graderId(viewer) } as const;
}

/**
 * Whose AI settings grade short answers. Online there is no AI: published short
 * answers carry key points and are scored by `scoreObjective` instead.
 */
const graderId = (viewer: Viewer) => (viewer.kind === "studio" ? viewer.userId : ADMIN_USER_ID);

/**
 * Save an answer and progress. In practice mode with `check`, the answer is
 * graded immediately and the solution is returned.
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  rawResponse: AnswerResponse,
  progress: { currentIndex: number; elapsedDeltaMs: number; check?: boolean },
): Promise<ActionResult<{ reveal: Reveal | null }>> {
  const found = await getOpenAttempt(attemptId);
  if ("error" in found) return fail(found.error!);
  const { attempt, userId } = found;
  if (!attempt.questionOrder.includes(questionId)) return fail("Cette question ne fait pas partie de la tentative");
  const parsed = ResponseSchema.safeParse(rawResponse);
  if (!parsed.success) return fail("Réponse invalide");
  const response = parsed.data;

  const existing = db
    .select()
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .get();
  // In practice mode a checked answer is locked.
  if (attempt.mode === "practice" && existing?.verdict) {
    return ok({ reveal: progress.check ? buildReveal(questionId, existing.score ?? 0, existing.verdict, existing.comment) : null });
  }

  let graded: { score: number; verdict: Verdict; comment: string | null } | null = null;
  if (attempt.mode === "practice" && progress.check) {
    const q = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    const objective = scoreObjective(q.answer, response);
    if (objective) {
      graded = { score: objective.score, verdict: objective.verdict, comment: objective.comment ?? null };
    } else if (q.answer.type === "short") {
      try {
        const grades = await gradeShortAnswers(userId, [
          {
            id: q.id,
            question: q.prompt,
            reference: q.answer.reference,
            rubric: q.answer.rubric,
            excerpt: q.excerpt,
            answer: response.type === "short" ? response.text : "",
          },
        ]);
        graded = grades.get(q.id)!;
      } catch (err) {
        const e = toLlmError(err);
        return fail(e instanceof LlmError ? `Impossible de corriger cette réponse : ${e.message}` : "Impossible de corriger cette réponse.");
      }
    }
  }

  db.insert(answers)
    .values({
      attemptId,
      questionId,
      response,
      answeredAt: new Date(),
      ...(graded ?? {}),
    })
    .onConflictDoUpdate({
      target: [answers.attemptId, answers.questionId],
      set: { response, answeredAt: new Date(), ...(graded ?? {}) },
    })
    .run();
  bumpProgress(attemptId, progress.currentIndex, progress.elapsedDeltaMs);

  return ok({ reveal: graded ? buildReveal(questionId, graded.score, graded.verdict, graded.comment) : null });
}

function buildReveal(questionId: string, score: number, verdict: Verdict, comment: string | null): Reveal {
  const q = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
  const link = q.sectionId ? sourceLinks([q.sectionId])[q.sectionId] : undefined;
  return {
    score,
    verdict,
    comment,
    answer: q.answer,
    explanation: q.explanation,
    excerpt: q.excerpt,
    sectionPath: q.sectionPath,
    sourceHref: link?.href ?? null,
  };
}

function bumpProgress(attemptId: string, currentIndex: number, elapsedDeltaMs: number) {
  db.update(attempts)
    .set({
      currentIndex: Math.max(0, Math.floor(currentIndex)),
      elapsedMs: sql`${attempts.elapsedMs} + ${clampDelta(elapsedDeltaMs)}`,
    })
    .where(eq(attempts.id, attemptId))
    .run();
}

export async function saveProgress(attemptId: string, currentIndex: number, elapsedDeltaMs: number): Promise<ActionResult> {
  const found = await getOpenAttempt(attemptId);
  if ("error" in found) return fail(found.error!);
  bumpProgress(attemptId, currentIndex, elapsedDeltaMs);
  return ok();
}

export async function setFlag(attemptId: string, questionId: string, flagged: boolean): Promise<ActionResult> {
  const found = await getOpenAttempt(attemptId);
  if ("error" in found) return fail(found.error!);
  if (!found.attempt.questionOrder.includes(questionId)) return fail("Cette question ne fait pas partie de la tentative");
  db.insert(answers)
    .values({ attemptId, questionId, flagged })
    .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { flagged } })
    .run();
  return ok();
}

/** Grade everything still ungraded (short answers in one LLM call), then close the attempt. */
export async function submitAttempt(attemptId: string, elapsedDeltaMs: number): Promise<ActionResult> {
  const found = await getOpenAttempt(attemptId);
  if ("error" in found) return fail(found.error!);
  const { attempt, userId } = found;

  const qs = db.select().from(questions).where(inArray(questions.id, attempt.questionOrder)).all();
  const ans = new Map(
    db.select().from(answers).where(eq(answers.attemptId, attemptId)).all().map((a) => [a.questionId, a]),
  );

  const updates = new Map<string, { score: number; verdict: Verdict; comment: string | null }>();
  const shortItems = [];
  for (const q of qs) {
    const a = ans.get(q.id);
    if (a?.verdict) continue;
    const objective = scoreObjective(q.answer, a?.response);
    if (objective) updates.set(q.id, { score: objective.score, verdict: objective.verdict, comment: objective.comment ?? null });
    else if (q.answer.type === "short") {
      shortItems.push({
        id: q.id,
        question: q.prompt,
        reference: q.answer.reference,
        rubric: q.answer.rubric,
        excerpt: q.excerpt,
        answer: a?.response?.type === "short" ? a.response.text : "",
      });
    }
  }
  if (shortItems.length) {
    try {
      const grades = await gradeShortAnswers(userId, shortItems);
      for (const [id, g] of grades) updates.set(id, g);
    } catch (err) {
      const e = toLlmError(err);
      return fail(
        `Tes réponses sont enregistrées, mais les réponses courtes n'ont pas pu être corrigées : ${e instanceof LlmError ? e.message : "erreur inattendue"} Réessaie d'envoyer.`,
      );
    }
  }

  db.transaction((tx) => {
    for (const [questionId, g] of updates) {
      tx.insert(answers)
        .values({ attemptId, questionId, ...g })
        .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: g })
        .run();
    }
    const scores = tx.select({ questionId: answers.questionId, score: answers.score }).from(answers).where(eq(answers.attemptId, attemptId)).all();
    const byQ = new Map(scores.map((s) => [s.questionId, s.score]));
    tx.update(attempts)
      .set({
        finishedAt: new Date(),
        score: attemptScore(attempt.questionOrder.map((id) => byQ.get(id))),
        elapsedMs: sql`${attempts.elapsedMs} + ${clampDelta(elapsedDeltaMs)}`,
      })
      .where(eq(attempts.id, attemptId))
      .run();
  });
  // The review schedule is yours alone; online players earn badges instead.
  if (attempt.playerId) awardBadges(attemptId);
  else recordReviews(attemptId);
  refresh();
  return ok();
}

/** "I was right": mark an auto-graded answer correct (e.g. a valid synonym in a blank). */
export async function overrideAnswer(attemptId: string, questionId: string): Promise<ActionResult> {
  if (!ownsAttempt(await requireUserId(), attemptId)) return fail("Tentative introuvable");
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt?.finishedAt) return fail("Termine d'abord la tentative");
  db.update(answers)
    .set({ score: 1, verdict: "correct", comment: "Marquée comme juste par toi." })
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .run();
  const scores = db.select({ questionId: answers.questionId, score: answers.score }).from(answers).where(eq(answers.attemptId, attemptId)).all();
  const byQ = new Map(scores.map((s) => [s.questionId, s.score]));
  db.update(attempts)
    .set({ score: attemptScore(attempt.questionOrder.map((id) => byQ.get(id))) })
    .where(eq(attempts.id, attemptId))
    .run();
  recordReviews(attemptId, [questionId]);
  refresh();
  return ok();
}

export async function deleteAttempt(attemptId: string): Promise<ActionResult> {
  const viewer = await viewerForAttempt(attemptId);
  if (!viewer) return fail("Tentative introuvable");
  // Players can drop an unfinished attempt, but not a result that counts on the leaderboard.
  if (viewer.kind === "player" && db.select().from(attempts).where(eq(attempts.id, attemptId)).get()?.finishedAt) {
    return fail("Une tentative terminée ne peut pas être supprimée");
  }
  db.delete(attempts).where(eq(attempts.id, attemptId)).run();
  refresh();
  return ok();
}
