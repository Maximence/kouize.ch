"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { ownsQuestion, ownsQuiz } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { questions, quizzes, type QuestionAnswer } from "@/lib/db/schema";
import { BLANK, DIFFICULTIES } from "@/lib/quiz/schemas";
import { fail, ok, type ActionResult } from "./result";

export async function renameQuiz(id: string, title: string): Promise<ActionResult> {
  if (!ownsQuiz(await requireUserId(), id)) return fail("Quiz introuvable");
  const t = title.trim();
  if (!t) return fail("Le titre ne peut pas être vide");
  db.update(quizzes).set({ title: t.slice(0, 200), updatedAt: new Date() }).where(eq(quizzes.id, id)).run();
  refresh();
  return ok();
}

export async function deleteQuiz(id: string): Promise<ActionResult> {
  if (!ownsQuiz(await requireUserId(), id)) return fail("Quiz introuvable");
  db.delete(quizzes).where(eq(quizzes.id, id)).run();
  refresh();
  return ok();
}

/** Copy a quiz and its current questions (not its attempts). */
export async function duplicateQuiz(id: string): Promise<ActionResult<{ id: string }>> {
  if (!ownsQuiz(await requireUserId(), id)) return fail("Quiz introuvable");
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, id)).get();
  if (!quiz) return fail("Quiz introuvable");
  const copy = db.transaction((tx) => {
    const q = tx
      .insert(quizzes)
      .values({
        categoryId: quiz.categoryId,
        title: `${quiz.title} (copy)`,
        settings: quiz.settings,
        language: quiz.language,
        status: "ready",
      })
      .returning()
      .get();
    const qs = tx
      .select()
      .from(questions)
      .where(and(eq(questions.quizId, id), isNull(questions.deletedAt)))
      .orderBy(asc(questions.ord))
      .all();
    if (qs.length) {
      tx.insert(questions)
        .values(qs.map((orig, i) => ({ ...withoutKeys(orig, ["id", "quizId"]), quizId: q.id, ord: i })))
        .run();
    }
    return q;
  });
  refresh();
  return ok({ id: copy.id });
}

function withoutKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

const QuestionEdit = z
  .object({
    prompt: z.string().trim().min(1, "La question ne peut pas être vide"),
    difficulty: z.enum(DIFFICULTIES),
    options: z.array(z.string().trim().min(1, "Les options ne peuvent pas être vides")),
    explanation: z.string().trim(),
    answer: z.discriminatedUnion("type", [
      z.object({ type: z.literal("mcq"), correct: z.number().int().min(0) }),
      z.object({ type: z.literal("multi"), correct: z.array(z.number().int().min(0)).min(1, "Coche au moins une bonne réponse") }),
      z.object({ type: z.literal("tf"), correct: z.boolean() }),
      z.object({
        type: z.literal("short"),
        reference: z.string().trim().min(1, "La réponse de référence est obligatoire"),
        rubric: z.array(z.string().trim().min(1)).min(1, "Ajoute au moins un point de barème"),
      }),
      z.object({ type: z.literal("blank"), accepted: z.array(z.string().trim().min(1)).min(1, "Ajoute une réponse acceptée") }),
    ]),
  })
  .superRefine((q, ctx) => {
    const a = q.answer;
    if (a.type === "mcq" && a.correct >= q.options.length) ctx.addIssue({ code: "custom", message: "Choisis la bonne réponse" });
    if (a.type === "multi" && a.correct.some((i) => i >= q.options.length))
      ctx.addIssue({ code: "custom", message: "Bonne réponse invalide" });
    if ((a.type === "mcq" || a.type === "multi") && q.options.length < 2)
      ctx.addIssue({ code: "custom", message: "Ajoute au moins deux options" });
    if (a.type === "blank" && !q.prompt.includes(BLANK))
      ctx.addIssue({ code: "custom", message: `La phrase doit contenir ${BLANK}` });
  });

export type QuestionEditInput = z.input<typeof QuestionEdit>;

export async function updateQuestion(id: string, input: QuestionEditInput): Promise<ActionResult> {
  const parsed = QuestionEdit.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!ownsQuestion(await requireUserId(), id)) return fail("Question introuvable");
  const existing = db.select().from(questions).where(eq(questions.id, id)).get();
  if (!existing) return fail("Question introuvable");
  if (existing.type !== parsed.data.answer.type) return fail("Le type de question ne peut pas changer");
  db.update(questions)
    .set({
      prompt: parsed.data.prompt,
      difficulty: parsed.data.difficulty,
      options: parsed.data.options,
      explanation: parsed.data.explanation,
      answer: parsed.data.answer as QuestionAnswer,
    })
    .where(eq(questions.id, id))
    .run();
  refresh();
  return ok();
}

/** Soft delete so past attempts that answered it still render. */
export async function deleteQuestion(id: string): Promise<ActionResult> {
  if (!ownsQuestion(await requireUserId(), id)) return fail("Question introuvable");
  db.update(questions).set({ deletedAt: new Date() }).where(eq(questions.id, id)).run();
  refresh();
  return ok();
}
