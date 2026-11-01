import { describe, expect, it } from "vitest";
import { BOXES, dueDate, INTERVAL_DAYS, isDue, nextBox, review } from "@/lib/srs/leitner";

const day = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 31, 15, 30); // local time, mid-afternoon

describe("Leitner scheduling", () => {
  it("moves up on correct, resets on incorrect, stays on partial", () => {
    expect(nextBox(1, "correct")).toBe(2);
    expect(nextBox(BOXES, "correct")).toBe(BOXES);
    expect(nextBox(4, "incorrect")).toBe(1);
    expect(nextBox(3, "partial")).toBe(3);
  });

  it("places a new card by its first answer", () => {
    expect(review(null, "correct", now).box).toBe(2);
    expect(review(null, "incorrect", now).box).toBe(1);
    expect(review(null, "partial", now).box).toBe(1);
    expect(review(null, "incorrect", now).lapses).toBe(0);
  });

  it("counts lapses on cards that were already learning", () => {
    const s = review({ box: 4, dueAt: now, lapses: 1 }, "incorrect", now);
    expect(s).toMatchObject({ box: 1, lapses: 2 });
  });

  it("schedules from the start of the day with growing intervals", () => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    for (let box = 1; box <= BOXES; box++) {
      expect(dueDate(box, now).getTime() - start.getTime()).toBe(INTERVAL_DAYS[box] * day);
    }
    expect(INTERVAL_DAYS[1]).toBeLessThan(INTERVAL_DAYS[5]);
  });

  it("a card answered today is due tomorrow at the earliest", () => {
    const s = review(null, "incorrect", now);
    expect(isDue(s, now)).toBe(false);
    expect(isDue(s, new Date(now.getTime() + day))).toBe(true);
  });
});
