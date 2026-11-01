import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, attempts, questions, quizzes, type AttemptFeedback, type Verdict } from "@/lib/db/schema";
import { callStructured } from "@/lib/llm";
import { isHosted } from "@/lib/settings";
import { correctAnswerText, responseText } from "./answer-text";
import { normalizeAnswer, verdictFor } from "./scoring";
import { FEEDBACK_SYSTEM, feedbackUserPrompt, type FeedbackMiss } from "@/lib/prompts/feedback";
import { GRADE_SYSTEM, gradeUserPrompt, type GradeItem } from "@/lib/prompts/grade";
import { preparedFeedback } from "./prepared-feedback";
import { FeedbackOutput, GradeOutput } from "./schemas";

export type ShortGrade = { score: number; verdict: Verdict; comment: string };

/** Grade short answers in one LLM call. Empty answers are marked incorrect without a call. */
export async function gradeShortAnswers(userId: string, items: GradeItem[]): Promise<Map<string, ShortGrade>> {
  const out = new Map<string, ShortGrade>();
  const toGrade = items.filter((it) => {
    if (it.answer.trim()) return true;
    out.set(it.id, { score: 0, verdict: "incorrect", comment: "Aucune réponse donnée." });
    return false;
  });
  if (!toGrade.length) return out;

  const res = await callStructured({
    userId,
    purpose: "grade",
    schema: GradeOutput,
    system: GRADE_SYSTEM,
    user: gradeUserPrompt(toGrade),
    mock: () => ({ grades: toGrade.map(mockGrade) }),
  });
  for (const g of res.data.grades) {
    if (!toGrade.some((it) => it.id === g.id)) continue;
    // Keep score and verdict consistent even if the model's are slightly off.
    const score = Math.min(1, Math.max(0, g.score));
    out.set(g.id, { score, verdict: g.verdict === verdictFor(score) ? g.verdict : verdictFor(score), comment: g.comment });
  }
  for (const it of toGrade) {
    if (!out.has(it.id)) out.set(it.id, { score: 0, verdict: "incorrect", comment: "Cette réponse n'a pas pu être corrigée." });
  }
  return out;
}

function mockGrade(it: GradeItem) {
  const ref = new Set(normalizeAnswer(it.reference).split(" ").filter((w) => w.length > 3));
  const ans = normalizeAnswer(it.answer).split(" ");
  const hit = ref.size ? ans.filter((w) => ref.has(w)).length / ref.size : 0;
  const score = hit >= 0.6 ? 1 : hit >= 0.2 ? 0.5 : 0;
  return {
    id: it.id,
    verdict: verdictFor(score),
    score,
    comment: score === 1 ? "Mock grade: covers the reference answer." : "Mock grade: some key points from the reference are missing.",
  };
}

/** Write the overall feedback for a finished attempt (cached on the attempt). */
export async function ensureFeedback(userId: string, attemptId: string): Promise<AttemptFeedback> {
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt) throw new Error("Tentative introuvable");
  if (attempt.feedback) return attempt.feedback;
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).get()!;

  const qs = db.select().from(questions).where(inArray(questions.id, attempt.questionOrder)).all();
  const ans = db.select().from(answers).where(eq(answers.attemptId, attemptId)).orderBy(asc(answers.answeredAt)).all();
  const byQ = new Map(ans.map((a) => [a.questionId, a]));
  const language = quiz.language === "fr" ? "fr" : "en";

  const misses: (FeedbackMiss & { sectionId: string | null })[] = [];
  for (const q of qs) {
    const a = byQ.get(q.id);
    if (a?.verdict === "correct") continue;
    misses.push({
      sectionId: q.sectionId,
      section: q.sectionPath || "Notes",
      question: q.prompt,
      studentAnswer: responseText(q, a?.response),
      correctAnswer: correctAnswerText(q, language === "fr" ? ["Vrai", "Faux"] : ["True", "False"]),
      verdict: a?.verdict === "partial" ? "partial" : "incorrect",
    });
  }

  const weak = new Map<string, { sectionId: string | null; path: string }>();
  for (const m of misses) weak.set(m.section, { sectionId: m.sectionId, path: m.section });

  // Online there's no AI: assemble the tips prepared in the studio before publishing.
  if (isHosted()) {
    const feedback: AttemptFeedback = {
      summary: preparedFeedback(language, attempt.score ?? 0, [...weak.keys()], quiz.studyTips ?? {}),
      weakSections: [...weak.values()],
    };
    db.update(attempts).set({ feedback }).where(eq(attempts.id, attemptId)).run();
    return feedback;
  }

  const res = await callStructured({
    userId,
    purpose: "feedback",
    schema: FeedbackOutput,
    system: FEEDBACK_SYSTEM,
    user: feedbackUserPrompt({ language, score: attempt.score ?? 0, total: qs.length, misses }),
    mock: () => ({
      feedback: misses.length
        ? `Mock feedback: good effort! Re-read **${[...new Set(misses.map((m) => m.section))].slice(0, 2).join("**, **")}**.\n\n- Rewrite the key definitions in your own words.\n- Redo the missed questions tomorrow.`
        : "Mock feedback: perfect score, well done!",
    }),
  });

  const feedback: AttemptFeedback = { summary: res.data.feedback.trim(), weakSections: [...weak.values()] };
  db.update(attempts).set({ feedback }).where(eq(attempts.id, attemptId)).run();
  return feedback;
}

