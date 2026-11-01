import type { Verdict } from "@/lib/db/schema";

/**
 * Leitner scheduling with 5 boxes. A correct answer moves a card up one box,
 * a wrong one sends it back to box 1, a partial answer keeps it where it is.
 * Box n is due again after INTERVAL_DAYS[n] days.
 */
export const BOXES = 5;
export const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewState = { box: number; dueAt: Date; lapses: number };

export function nextBox(box: number, verdict: Verdict): number {
  if (verdict === "correct") return Math.min(BOXES, box + 1);
  if (verdict === "incorrect") return 1;
  return Math.max(1, box);
}

/** Schedule from the start of the review day so cards come due at the same time of day, not drifting. */
export function dueDate(box: number, now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return new Date(start.getTime() + INTERVAL_DAYS[box] * DAY_MS);
}

export function review(prev: ReviewState | null, verdict: Verdict, now = new Date()): ReviewState {
  // A first answer places the card: correct → box 2, otherwise box 1.
  const box = prev ? nextBox(prev.box, verdict) : verdict === "correct" ? 2 : 1;
  return {
    box,
    dueAt: dueDate(box, now),
    lapses: (prev?.lapses ?? 0) + (verdict === "incorrect" && prev ? 1 : 0),
  };
}

export function isDue(state: Pick<ReviewState, "dueAt">, now = new Date()): boolean {
  return state.dueAt.getTime() <= now.getTime();
}
