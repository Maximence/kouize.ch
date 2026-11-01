import { describe, expect, it } from "vitest";
import { normalizeRecoveryCode } from "@/lib/auth/recovery-code";
import { preparedFeedback } from "@/lib/quiz/prepared-feedback";
import { fallbackKeyPoints, keywordMatches, scoreKeyPoints, scoreObjective } from "@/lib/quiz/scoring";

const keyPoints = [
  { point: "Sample at least twice the highest frequency", keywords: ["deux fois", "double", "2 fois", "twice"] },
  { point: "Otherwise aliasing appears", keywords: ["repliement", "aliasing", "recouvrement"] },
];

describe("keyword grading (online, no AI)", () => {
  it("ignores case, accents and word endings", () => {
    expect(keywordMatches("repliement", "le spectre subit un REPLIEMENTS".toLowerCase().split(" "))).toBe(true);
    expect(keywordMatches("frequence", ["frequences"])).toBe(true);
    expect(keywordMatches("deux fois", "il faut deux fois plus".split(" "))).toBe(true);
    expect(keywordMatches("bit", ["bits"])).toBe(false); // short words must match exactly
  });

  it("gives credit per key point and says what's missing", () => {
    const full = scoreKeyPoints(keyPoints, "Il faut échantillonner à deux fois la fréquence max, sinon repliement.");
    expect(full).toMatchObject({ score: 1, verdict: "correct" });
    const half = scoreKeyPoints(keyPoints, "On échantillonne au double de la fréquence maximale");
    expect(half).toMatchObject({ score: 0.5, verdict: "partial" });
    expect(half.comment).toContain("Manquant : Otherwise aliasing appears");
    expect(scoreKeyPoints(keyPoints, "   ")).toMatchObject({ score: 0, verdict: "incorrect" });
  });

  it("is used by scoreObjective only when key points were prepared", () => {
    const withKp = { type: "short" as const, reference: "r", rubric: ["a"], keyPoints };
    expect(scoreObjective(withKp, { type: "short", text: "aliasing, twice" })?.score).toBe(1);
    expect(scoreObjective({ type: "short", reference: "r", rubric: ["a"] }, { type: "short", text: "x" })).toBeNull();
  });

  it("builds fallback key points from the rubric", () => {
    expect(fallbackKeyPoints(["Mentions the Nyquist frequency"])).toEqual([
      { point: "Mentions the Nyquist frequency", keywords: ["mentions", "nyquist", "frequency"] },
    ]);
  });
});

describe("prepared feedback", () => {
  it("assembles the tips of the weak sections in the quiz language", () => {
    const md = preparedFeedback("fr", 0.6, ["Signal > Nyquist"], { "Signal > Nyquist": "Refais l'exemple à 44,1 kHz." });
    expect(md).toContain("60 %");
    expect(md).toContain("**Nyquist**: Refais l'exemple à 44,1 kHz.");
    expect(preparedFeedback("en", 1, [], {})).toContain("Perfect score");
  });
});

describe("recovery codes", () => {
  it("accepts sloppy input and rejects junk", () => {
    expect(normalizeRecoveryCode("kz-abcd efgh-jkmn-pqrs")).toBe("KZ-ABCD-EFGH-JKMN-PQRS");
    expect(normalizeRecoveryCode("ABCDEFGHJKMNPQRS")).toBe("KZ-ABCD-EFGH-JKMN-PQRS");
    expect(normalizeRecoveryCode("KZ-0O1I-L000-0000-0000")).toBe("KZ-0011-1000-0000-0000");
    expect(normalizeRecoveryCode("KZ-ABCD")).toBeNull();
    expect(normalizeRecoveryCode("KZ-ABCD-EFGH-JKMN-PQRU")).toBeNull();
  });
});
