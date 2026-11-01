import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, reviewItems, type Verdict } from "@/lib/db/schema";
import { review } from "./leitner";

/** Update the review schedule of one question from an answer verdict. */
export function recordReview(questionId: string, verdict: Verdict, now = new Date()) {
  const prev = db.select().from(reviewItems).where(eq(reviewItems.questionId, questionId)).get();
  const next = review(prev ?? null, verdict, now);
  db.insert(reviewItems)
    .values({ questionId, ...next, lastReviewedAt: now })
    .onConflictDoUpdate({ target: reviewItems.questionId, set: { ...next, lastReviewedAt: now } })
    .run();
}

/** Feed every graded answer of a finished attempt into the review schedule. */
export function recordReviews(attemptId: string, onlyQuestionIds?: string[]) {
  const graded = db
    .select({ questionId: answers.questionId, verdict: answers.verdict })
    .from(answers)
    .where(
      and(
        eq(answers.attemptId, attemptId),
        isNotNull(answers.verdict),
        onlyQuestionIds ? inArray(answers.questionId, onlyQuestionIds) : undefined,
      ),
    )
    .all();
  const now = new Date();
  db.transaction(() => {
    for (const g of graded) recordReview(g.questionId, g.verdict!, now);
  });
}
