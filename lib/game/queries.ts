import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMembers, playerBadges } from "@/lib/db/schema";
import { BADGES, type BadgeId } from "./badges";
import { levelFor, standings, weekStart, type AttemptXp, type Standing } from "./xp";

/** XP of every finished player attempt in a class (on quizzes still listed or not). */
export function classAttemptXps(classId: string): AttemptXp[] {
  return db.all<AttemptXp>(sql`
    SELECT a.id AS attemptId, a.player_id AS playerId, a.quiz_id AS quizId, COALESCE(a.score, 0) AS score,
      a.finished_at AS finishedAt,
      COALESCE(SUM(ROUND(MIN(MAX(COALESCE(an.score, 0), 0), 1) *
        CASE q.difficulty WHEN 'easy' THEN 10 WHEN 'hard' THEN 30 ELSE 20 END)), 0) AS xp
    FROM attempts a
    JOIN quizzes z ON z.id = a.quiz_id
    LEFT JOIN answers an ON an.attempt_id = a.id
    LEFT JOIN questions q ON q.id = an.question_id
    WHERE z.class_id = ${classId} AND a.player_id IS NOT NULL AND a.finished_at IS NOT NULL
    GROUP BY a.id
  `);
}

export type LeaderRow = Standing & { name: string };

export function leaderboard(classId: string, period: "week" | "all", now = new Date()): LeaderRow[] {
  const names = memberNames(classId);
  const rows = classAttemptXps(classId).filter((r) => names.has(r.playerId));
  return standings(rows, period === "week" ? weekStart(now) : undefined).map((s) => ({
    ...s,
    name: names.get(s.playerId)!,
  }));
}

function memberNames(classId: string): Map<string, string> {
  return new Map(
    db
      .select({ playerId: classMembers.playerId, name: classMembers.displayName })
      .from(classMembers)
      .where(eq(classMembers.classId, classId))
      .all()
      .map((m) => [m.playerId, m.name]),
  );
}

export type EarnedBadge = { id: BadgeId; emoji: string; name: string; description: string; earnedAt: Date; attemptId: string | null };

export function playerBadgeList(playerId: string, classId: string): EarnedBadge[] {
  return db
    .select()
    .from(playerBadges)
    .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.classId, classId)))
    .orderBy(asc(playerBadges.earnedAt))
    .all()
    .filter((b) => b.badge in BADGES)
    .map((b) => ({ id: b.badge as BadgeId, ...BADGES[b.badge as BadgeId], earnedAt: b.earnedAt, attemptId: b.attemptId }));
}

/** XP, level and rank of a player in a class. */
export function playerStanding(playerId: string, classId: string) {
  const board = leaderboard(classId, "all");
  const me = board.find((r) => r.playerId === playerId);
  const xp = me?.xp ?? 0;
  return { xp, level: levelFor(xp), rank: me?.rank ?? null, players: board.length };
}

/** What one finished attempt changed for its player: XP gained, level, badges, rank. */
export function attemptOutcome(attemptId: string, playerId: string, classId: string) {
  const rows = classAttemptXps(classId);
  const self = rows.find((r) => r.attemptId === attemptId);
  if (!self) return null;
  const mine = rows.filter((r) => r.playerId === playerId);
  const before = standings(mine.filter((r) => r.finishedAt < self.finishedAt))[0]?.xp ?? 0;
  const after = standings(mine.filter((r) => r.finishedAt <= self.finishedAt))[0]?.xp ?? 0;
  const standing = playerStanding(playerId, classId);
  return {
    attemptXp: self.xp,
    gained: after - before,
    levelBefore: levelFor(before),
    levelAfter: levelFor(after),
    badges: playerBadgeList(playerId, classId).filter((b) => b.attemptId === attemptId),
    rank: standing.rank,
    players: standing.players,
  };
}
