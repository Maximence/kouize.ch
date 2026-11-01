import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, categories, files, questions, quizzes } from "@/lib/db/schema";

// Every subject belongs to one user, and everything else hangs off a subject.
// Check one of these before reading or changing anything by id.

export function ownsCategory(userId: string, categoryId: string): boolean {
  return Boolean(
    db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .get(),
  );
}

export function ownsFile(userId: string, fileId: string): boolean {
  return Boolean(
    db
      .select({ id: files.id })
      .from(files)
      .innerJoin(categories, eq(categories.id, files.categoryId))
      .where(and(eq(files.id, fileId), eq(categories.userId, userId)))
      .get(),
  );
}

export function ownsQuiz(userId: string, quizId: string): boolean {
  return Boolean(
    db
      .select({ id: quizzes.id })
      .from(quizzes)
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(and(eq(quizzes.id, quizId), eq(categories.userId, userId)))
      .get(),
  );
}

export function ownsAttempt(userId: string, attemptId: string): boolean {
  return Boolean(
    db
      .select({ id: attempts.id })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(and(eq(attempts.id, attemptId), eq(categories.userId, userId)))
      .get(),
  );
}

export function ownsQuestion(userId: string, questionId: string): boolean {
  return Boolean(
    db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(and(eq(questions.id, questionId), eq(categories.userId, userId)))
      .get(),
  );
}
