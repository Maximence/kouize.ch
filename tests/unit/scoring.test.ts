import { describe, expect, it } from "vitest";
import {
  attemptScore,
  isAnswered,
  normalizeAnswer,
  scoreObjective,
  verdictFor,
} from "@/lib/quiz/scoring";
import { mulberry32, planAttempt, shuffle } from "@/lib/quiz/shuffle";

describe("scoreObjective", () => {
  it("scores multiple choice", () => {
    expect(scoreObjective({ type: "mcq", correct: 2 }, { type: "mcq", choice: 2 })).toEqual({ score: 1, verdict: "correct" });
    expect(scoreObjective({ type: "mcq", correct: 2 }, { type: "mcq", choice: 1 })).toEqual({ score: 0, verdict: "incorrect" });
    expect(scoreObjective({ type: "mcq", correct: 2 }, { type: "mcq", choice: null })?.score).toBe(0);
  });

  it("scores true/false", () => {
    expect(scoreObjective({ type: "tf", correct: false }, { type: "tf", choice: false })?.score).toBe(1);
    expect(scoreObjective({ type: "tf", correct: false }, { type: "tf", choice: true })?.score).toBe(0);
  });

  it("gives partial credit on multi-select and never goes negative", () => {
    const ans = { type: "multi" as const, correct: [0, 2] };
    expect(scoreObjective(ans, { type: "multi", choices: [0, 2] })).toEqual({ score: 1, verdict: "correct" });
    expect(scoreObjective(ans, { type: "multi", choices: [0] })).toEqual({ score: 0.5, verdict: "partial" });
    expect(scoreObjective(ans, { type: "multi", choices: [0, 1] })).toEqual({ score: 0, verdict: "incorrect" });
    expect(scoreObjective(ans, { type: "multi", choices: [1, 3] })).toEqual({ score: 0, verdict: "incorrect" });
    expect(scoreObjective(ans, { type: "multi", choices: [0, 2, 3] })?.score).toBe(0.5);
  });

  it("matches fill-in-the-blank ignoring case, accents and punctuation", () => {
    const ans = { type: "blank" as const, accepted: ["Fréquence de Nyquist", "Nyquist"] };
    expect(scoreObjective(ans, { type: "blank", text: "  frequence de NYQUIST. " })?.score).toBe(1);
    expect(scoreObjective(ans, { type: "blank", text: "nyquist" })?.score).toBe(1);
    expect(scoreObjective(ans, { type: "blank", text: "Shannon" })?.score).toBe(0);
    expect(scoreObjective(ans, { type: "blank", text: "" })?.score).toBe(0);
  });

  it("defers short answers to the LLM and treats missing/mismatched responses as wrong", () => {
    expect(scoreObjective({ type: "short", reference: "x", rubric: ["x"] }, { type: "short", text: "x" })).toBeNull();
    expect(scoreObjective({ type: "mcq", correct: 0 }, null)).toEqual({ score: 0, verdict: "incorrect" });
    expect(scoreObjective({ type: "mcq", correct: 0 }, { type: "tf", choice: true })?.score).toBe(0);
  });
});

describe("helpers", () => {
  it("normalizeAnswer", () => {
    expect(normalizeAnswer("  Échantillonnage-Spectral! ")).toBe("echantillonnage spectral");
  });
  it("attemptScore averages and counts unanswered as 0", () => {
    expect(attemptScore([1, 0.5, null, 0.5])).toBe(0.5);
    expect(attemptScore([])).toBe(0);
  });
  it("verdictFor", () => {
    expect(verdictFor(1)).toBe("correct");
    expect(verdictFor(0)).toBe("incorrect");
    expect(verdictFor(0.4)).toBe("partial");
  });
  it("isAnswered", () => {
    expect(isAnswered({ type: "mcq", choice: 0 })).toBe(true);
    expect(isAnswered({ type: "mcq", choice: null })).toBe(false);
    expect(isAnswered({ type: "short", text: "  " })).toBe(false);
    expect(isAnswered({ type: "multi", choices: [] })).toBe(false);
  });
});

describe("shuffling", () => {
  const qs = Array.from({ length: 8 }, (_, i) => ({
    id: `q${i}`,
    type: (i % 2 ? "mcq" : "tf") as "mcq" | "tf",
    options: i % 2 ? ["a", "b", "c", "d"] : ["True", "False"],
  }));

  it("is deterministic per seed and a permutation", () => {
    const a = planAttempt(qs, 42);
    const b = planAttempt(qs, 42);
    expect(a).toEqual(b);
    expect([...a.questionOrder].sort()).toEqual(qs.map((q) => q.id).sort());
    for (const q of qs) expect([...a.optionOrders[q.id]].sort()).toEqual(q.options.map((_, i) => i));
  });

  it("differs across seeds and keeps True/False in order", () => {
    const a = planAttempt(qs, 1);
    const b = planAttempt(qs, 2);
    expect(a.questionOrder).not.toEqual(b.questionOrder);
    expect(a.optionOrders.q0).toEqual([0, 1]);
  });

  it("can keep question order", () => {
    expect(planAttempt(qs, 7, { shuffleQuestions: false }).questionOrder).toEqual(qs.map((q) => q.id));
  });

  it("shuffle uses every element once", () => {
    const out = shuffle([1, 2, 3, 4, 5], mulberry32(3));
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
