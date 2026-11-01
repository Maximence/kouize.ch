// XP, levels and leaderboards. Pure functions: the database code lives in ./queries.ts.
import type { Difficulty } from "@/lib/db/schema";

export const DIFFICULTY_XP: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 30 };

/** XP of one answer: the question's difficulty points times its score (0–1). */
export const answerXp = (difficulty: Difficulty, score: number | null | undefined) =>
  Math.round(DIFFICULTY_XP[difficulty] * Math.min(1, Math.max(0, score ?? 0)));

export type AttemptXp = {
  attemptId: string;
  playerId: string;
  quizId: string;
  xp: number;
  score: number;
  finishedAt: number;
};

/** Each player's best attempt per quiz (most XP; on a tie, the earlier one). */
export function bestAttempts(rows: AttemptXp[]): Map<string, Map<string, AttemptXp>> {
  const best = new Map<string, Map<string, AttemptXp>>();
  for (const r of rows) {
    const quizzes = best.get(r.playerId) ?? new Map<string, AttemptXp>();
    best.set(r.playerId, quizzes);
    const cur = quizzes.get(r.quizId);
    if (!cur || r.xp > cur.xp || (r.xp === cur.xp && r.finishedAt < cur.finishedAt)) quizzes.set(r.quizId, r);
  }
  return best;
}

export type Standing = { playerId: string; xp: number; quizzes: number; reachedAt: number; rank: number };

/**
 * Leaderboard: the sum of each player's best attempt per quiz, so retakes can
 * raise a score but never farm points. With `since`, only attempts finished
 * from then on count (the weekly board). Ties go to whoever got there first.
 */
export function standings(rows: AttemptXp[], since?: number): Standing[] {
  const counted = since == null ? rows : rows.filter((r) => r.finishedAt >= since);
  const list = [...bestAttempts(counted)].map(([playerId, quizzes]) => {
    const best = [...quizzes.values()];
    return {
      playerId,
      xp: best.reduce((a, b) => a + b.xp, 0),
      quizzes: best.length,
      reachedAt: Math.max(...best.map((b) => b.finishedAt)),
    };
  });
  list.sort((a, b) => b.xp - a.xp || a.reachedAt - b.reachedAt);
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

export function totalXp(rows: AttemptXp[], playerId: string): number {
  return standings(rows.filter((r) => r.playerId === playerId))[0]?.xp ?? 0;
}

const LEVEL_TITLES = [
  "Débutant",
  "Preneur de notes",
  "Surligneur",
  "Quizzeur",
  "Fan de fiches",
  "Pote de révision",
  "Cerveau",
  "Premier de la classe",
  "Professeur",
  "Légende KOUIZE",
];

/** XP needed to reach a level: 0, 100, 300, 600, 1000, … (50·n·(n+1) for level n+1). */
export const levelThreshold = (level: number) => 50 * (level - 1) * level;

export type Level = { level: number; title: string; floor: number; next: number; progress: number };

export function levelFor(xp: number): Level {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level++;
  const floor = levelThreshold(level);
  const next = levelThreshold(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    floor,
    next,
    progress: (xp - floor) / (next - floor),
  };
}

/** Monday 00:00 of the current week in the given time zone, as epoch ms. */
export function weekStart(now: Date, timeZone = "Europe/Zurich"): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  const daysSinceMonday = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 7) % 7;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day - daysSinceMonday) - offset;
}
