import { describe, expect, it } from "vitest";
import { badgesEarned } from "@/lib/game/badges";
import { answerXp, levelFor, levelThreshold, standings, totalXp, weekStart, type AttemptXp } from "@/lib/game/xp";

const at = (playerId: string, quizId: string, xp: number, finishedAt: number, id = `${playerId}-${quizId}-${finishedAt}`): AttemptXp => ({
  attemptId: id,
  playerId,
  quizId,
  xp,
  score: xp / 100,
  finishedAt,
});

describe("XP", () => {
  it("weights answers by difficulty and score", () => {
    expect(answerXp("easy", 1)).toBe(10);
    expect(answerXp("medium", 0.5)).toBe(10);
    expect(answerXp("hard", 1)).toBe(30);
    expect(answerXp("hard", null)).toBe(0);
    expect(answerXp("hard", 3)).toBe(30);
  });

  it("counts only the best attempt per quiz, so retakes can't farm points", () => {
    const rows = [at("ana", "q1", 40, 1), at("ana", "q1", 60, 2), at("ana", "q1", 60, 3), at("ana", "q2", 20, 4)];
    expect(totalXp(rows, "ana")).toBe(80);
  });

  it("ranks by XP, and on a tie whoever got there first", () => {
    const rows = [at("ana", "q1", 50, 10), at("bob", "q1", 50, 5), at("cy", "q1", 80, 20)];
    expect(standings(rows).map((s) => [s.playerId, s.rank])).toEqual([
      ["cy", 1],
      ["bob", 2],
      ["ana", 3],
    ]);
  });

  it("weekly board only counts attempts since the cutoff", () => {
    const rows = [at("ana", "q1", 90, 1), at("bob", "q1", 30, 100)];
    const week = standings(rows, 50);
    expect(week.map((s) => s.playerId)).toEqual(["bob"]);
  });
});

describe("levels", () => {
  it("follows 0, 100, 300, 600…", () => {
    expect([1, 2, 3, 4, 5].map(levelThreshold)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toMatchObject({ level: 1, title: "Débutant", progress: 0 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(450)).toMatchObject({ level: 3, floor: 300, next: 600, progress: 0.5 });
  });
});

describe("weekStart", () => {
  it("is Monday 00:00 in Zurich", () => {
    // Wednesday 2026-11-04 15:00 UTC → Monday 2026-11-02 00:00 CET = 2026-11-01 23:00 UTC.
    expect(new Date(weekStart(new Date("2026-11-04T15:00:00Z"))).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    // Sunday late evening still belongs to the week that started the previous Monday.
    expect(new Date(weekStart(new Date("2026-11-08T22:30:00Z"))).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    // Summer time (CEST, UTC+2).
    expect(new Date(weekStart(new Date("2026-07-01T10:00:00Z"))).toISOString()).toBe("2026-06-28T22:00:00.000Z");
  });
});

describe("badges", () => {
  const base = { classQuizIds: ["q1", "q2", "q3"], firstToFinish: false };
  it("first quiz and perfect score", () => {
    const earned = badgesEarned({ ...base, attempts: [{ id: "a", quizId: "q1", score: 1, finishedAt: 1 }], currentAttemptId: "a" });
    expect(earned).toEqual(expect.arrayContaining(["first_quiz", "perfect"]));
    expect(earned).not.toContain("sharpshooter");
  });

  it("comeback needs +30 points on the same quiz", () => {
    const attempts = [
      { id: "a", quizId: "q1", score: 0.4, finishedAt: 1 },
      { id: "b", quizId: "q1", score: 0.7, finishedAt: 2 },
    ];
    expect(badgesEarned({ ...base, attempts, currentAttemptId: "b" })).toContain("comeback");
    expect(badgesEarned({ ...base, attempts: [attempts[0], { ...attempts[1], score: 0.6 }], currentAttemptId: "b" })).not.toContain("comeback");
  });

  it("completionist when every quiz is done, pioneer when first", () => {
    const attempts = ["q1", "q2", "q3"].map((quizId, i) => ({ id: quizId, quizId, score: 0.5, finishedAt: i }));
    expect(badgesEarned({ ...base, attempts, currentAttemptId: "q3", firstToFinish: true })).toEqual(
      expect.arrayContaining(["completionist", "pioneer"]),
    );
    expect(badgesEarned({ ...base, attempts: attempts.slice(0, 2), currentAttemptId: "q2" })).not.toContain("completionist");
  });
});
