import "server-only";
import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, playerBadges, quizzes } from "@/lib/db/schema";
import { badgesEarned } from "./badges";

/** Store the badges a just-finished player attempt earns. Already-earned badges keep their date. */
export function awardBadges(attemptId: string) {
  const current = db
    .select({ playerId: attempts.playerId, quizId: attempts.quizId, finishedAt: attempts.finishedAt, classId: quizzes.classId })
    .from(attempts)
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(eq(attempts.id, attemptId))
    .get();
  if (!current?.playerId || !current.classId || !current.finishedAt) return;
  const { playerId, classId } = current;

  const mine = db
    .select({ id: attempts.id, quizId: attempts.quizId, score: attempts.score, finishedAt: attempts.finishedAt })
    .from(attempts)
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(and(eq(attempts.playerId, playerId), eq(quizzes.classId, classId), isNotNull(attempts.finishedAt)))
    .all()
    .map((a) => ({ ...a, score: a.score ?? 0, finishedAt: +a.finishedAt! }));
  const classQuizIds = db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.classId, classId), eq(quizzes.hidden, false)))
    .all()
    .map((q) => q.id);
  const someoneElseFirst = db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.quizId, current.quizId),
        isNotNull(attempts.playerId),
        ne(attempts.playerId, playerId),
        lt(attempts.finishedAt, current.finishedAt),
      ),
    )
    .get();
  const mineEarlier = mine.some((a) => a.quizId === current.quizId && a.finishedAt < +current.finishedAt!);

  const earned = badgesEarned({
    attempts: mine,
    currentAttemptId: attemptId,
    classQuizIds,
    firstToFinish: !someoneElseFirst && !mineEarlier,
  });
  if (!earned.length) return;
  db.insert(playerBadges)
    .values(earned.map((badge) => ({ playerId, classId, badge, attemptId })))
    .onConflictDoNothing()
    .run();
}
