"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { ownsAttempt } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { answers, attempts, fileVersions, questions, quizzes, sections, type QuizSettings } from "@/lib/db/schema";
import { MAX_QUESTIONS, MIN_QUESTIONS } from "@/lib/quiz/settings-schema";
import { fail, ok, type ActionResult } from "./result";

async function wrongQuestions(attemptId: string) {
  if (!ownsAttempt(await requireUserId(), attemptId)) return null;
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt?.finishedAt) return null;
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).get()!;
  const correct = new Set(
    db
      .select({ id: answers.questionId })
      .from(answers)
      .where(and(eq(answers.attemptId, attemptId), eq(answers.verdict, "correct")))
      .all()
      .map((r) => r.id),
  );
  const wrongIds = attempt.questionOrder.filter((id) => !correct.has(id));
  const qs = wrongIds.length ? db.select().from(questions).where(inArray(questions.id, wrongIds)).all() : [];
  // keep the attempt's order
  qs.sort((a, b) => wrongIds.indexOf(a.id) - wrongIds.indexOf(b.id));
  return { attempt, quiz, questions: qs };
}

/** New quiz containing exactly the questions missed in this attempt (no API call). */
export async function retrySameQuestions(attemptId: string): Promise<ActionResult<{ quizId: string }>> {
  const data = await wrongQuestions(attemptId);
  if (!data) return fail("Tentative introuvable ou non terminée");
  if (!data.questions.length) return fail("Aucune erreur à refaire. Bravo !");
  const { quiz } = data;
  const created = db.transaction((tx) => {
    const q = tx
      .insert(quizzes)
      .values({
        categoryId: quiz.categoryId,
        title: `${quiz.title} · mistakes`,
        settings: { ...quiz.settings, count: data.questions.length, sourceAttemptId: attemptId },
        language: quiz.language,
        status: "ready",
      })
      .returning()
      .get();
    tx.insert(questions)
      .values(
        data.questions.map((x, i) => ({
          quizId: q.id,
          ord: i,
          type: x.type,
          difficulty: x.difficulty,
          prompt: x.prompt,
          options: x.options,
          answer: x.answer,
          explanation: x.explanation,
          sectionId: x.sectionId,
          sectionPath: x.sectionPath,
          excerpt: x.excerpt,
        })),
      )
      .run();
    return q;
  });
  refresh();
  return ok({ quizId: created.id });
}

/** Settings for generating fresh questions on the sections behind the mistakes. */
export async function retryNewQuestionsSettings(
  attemptId: string,
): Promise<ActionResult<{ categoryId: string; settings: QuizSettings }>> {
  const data = await wrongQuestions(attemptId);
  if (!data) return fail("Tentative introuvable ou non terminée");
  const sectionIds = [...new Set(data.questions.map((q) => q.sectionId).filter((x): x is string => Boolean(x)))];
  if (!sectionIds.length) return fail("Les sections de ces erreurs n'existent plus.");
  const fileIds = [
    ...new Set(
      db
        .select({ fileId: fileVersions.fileId })
        .from(sections)
        .innerJoin(fileVersions, eq(fileVersions.id, sections.fileVersionId))
        .where(inArray(sections.id, sectionIds))
        .all()
        .map((r) => r.fileId),
    ),
  ];
  const s = data.quiz.settings;
  return ok({
    categoryId: data.quiz.categoryId,
    settings: {
      fileIds,
      sectionIds,
      count: Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, data.questions.length * 2)),
      difficulty: s.difficulty,
      types: s.types,
      language: data.quiz.language === "fr" ? "fr" : "en",
      sourceAttemptId: attemptId,
    },
  });
}
