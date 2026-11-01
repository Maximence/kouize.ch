import "server-only";
import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { connection } from "next/server";
import { ownsCategory, ownsQuiz } from "@/lib/auth/ownership";
import { requireUserId, studioUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { answers, attempts, categories, questions, quizzes, reviewItems } from "@/lib/db/schema";
import { sourceLinks } from "@/lib/source-links";

export type StudyCard = {
  id: string;
  type: (typeof questions.$inferSelect)["type"];
  prompt: string;
  options: string[];
  answer: (typeof questions.$inferSelect)["answer"];
  explanation: string;
  excerpt: string;
  sectionPath: string;
  imageId: string | null;
  imageAlt: string | null;
  sourceHref: string | null;
  quizTitle: string;
  language: "fr" | "en";
  box?: number;
};

function withLinks<T extends { sectionId: string | null }>(rows: T[]) {
  const links = sourceLinks(rows.map((r) => r.sectionId));
  return rows.map((r) => ({ ...r, sourceHref: r.sectionId ? (links[r.sectionId]?.href ?? null) : null }));
}

/** Questions whose Leitner due date has passed (optionally within one subject). */
export async function dueReviewCards(categoryId?: string, limit = 50): Promise<StudyCard[]> {
  await connection();
  const userId = await requireUserId();
  const rows = db
    .select({
      id: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      options: questions.options,
      answer: questions.answer,
      explanation: questions.explanation,
      excerpt: questions.excerpt,
      sectionPath: questions.sectionPath,
      imageId: questions.imageId,
      imageAlt: questions.imageAlt,
      sectionId: questions.sectionId,
      quizTitle: quizzes.title,
      language: quizzes.language,
      box: reviewItems.box,
    })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(
      and(
        eq(categories.userId, userId),
        lte(reviewItems.dueAt, new Date()),
        isNull(questions.deletedAt),
        categoryId ? eq(quizzes.categoryId, categoryId) : undefined,
      ),
    )
    .orderBy(asc(reviewItems.box), asc(reviewItems.dueAt))
    .limit(limit)
    .all();
  return withLinks(rows).map((r) => ({ ...r, language: r.language === "fr" ? "fr" : "en" }));
}

export async function reviewSummary() {
  await connection();
  const userId = await requireUserId();
  const now = new Date();
  return db
    .select({
      categoryId: categories.id,
      name: categories.name,
      emoji: categories.emoji,
      due: sql<number>`sum(case when ${reviewItems.dueAt} <= ${now.getTime()} then 1 else 0 end)`,
      total: sql<number>`count(*)`,
    })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(and(eq(categories.userId, userId), isNull(questions.deletedAt)))
    .groupBy(categories.id)
    .orderBy(asc(categories.name))
    .all();
}

/** For the header badge: 0 for anyone but you. */
export async function dueCount(): Promise<number> {
  await connection();
  const userId = await studioUserId();
  if (!userId) return 0;
  const user = { id: userId };
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(reviewItems)
      .innerJoin(questions, eq(questions.id, reviewItems.questionId))
      .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(and(eq(categories.userId, user.id), lte(reviewItems.dueAt, new Date()), isNull(questions.deletedAt)))
      .get()?.n ?? 0
  );
}

export async function flashcards(quizId: string): Promise<StudyCard[]> {
  await connection();
  if (!ownsQuiz(await requireUserId(), quizId)) return [];
  return quizCards(quizId);
}

/** Flashcards of a quiz, without an access check: the caller makes it. */
export function quizCards(quizId: string): StudyCard[] {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return [];
  const rows = db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.deletedAt)))
    .orderBy(asc(questions.ord))
    .all();
  return withLinks(rows).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    excerpt: q.excerpt,
    sectionPath: q.sectionPath,
    imageId: q.imageId,
    imageAlt: q.imageAlt,
    sourceHref: q.sourceHref,
    quizTitle: quiz.title,
    language: quiz.language === "fr" ? "fr" : "en",
  }));
}

export type WeakSpot = {
  sectionPath: string;
  sectionId: string | null;
  href: string | null;
  answered: number;
  accuracy: number;
  lastSeen: number;
};

/**
 * Accuracy per section over every graded answer in finished attempts of a subject.
 * Sections are grouped by heading path so different file versions of the same section merge.
 */
export async function weakSpots(categoryId: string): Promise<WeakSpot[]> {
  await connection();
  if (!ownsCategory(await requireUserId(), categoryId)) return [];
  const rows = db
    .select({
      sectionPath: questions.sectionPath,
      sectionId: sql<string | null>`max(${questions.sectionId})`,
      answered: sql<number>`count(*)`,
      accuracy: sql<number>`avg(coalesce(${answers.score}, 0))`,
      lastSeen: sql<number>`max(${attempts.finishedAt})`,
    })
    .from(answers)
    .innerJoin(attempts, eq(attempts.id, answers.attemptId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(and(eq(quizzes.categoryId, categoryId), isNotNull(attempts.finishedAt), isNotNull(answers.verdict)))
    .groupBy(questions.sectionPath)
    .orderBy(asc(sql`avg(coalesce(${answers.score}, 0))`))
    .all();
  const links = sourceLinks(rows.map((r) => r.sectionId));
  return rows.map((r) => ({ ...r, href: r.sectionId ? (links[r.sectionId]?.href ?? null) : null }));
}
