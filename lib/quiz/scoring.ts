import type { AnswerResponse, KeyPoint, QuestionAnswer, Verdict } from "@/lib/db/schema";

export type Score = { score: number; verdict: Verdict; comment?: string };

export function verdictFor(score: number): Verdict {
  return score >= 0.999 ? "correct" : score <= 0.001 ? "incorrect" : "partial";
}

/** Lowercase, strip accents and punctuation, collapse spaces: "  Fréquence-de Nyquist! " → "frequence de nyquist". */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Score everything that doesn't need the LLM: all types except short answers,
 * and short answers that carry prepared key points (published quizzes).
 * Multi-select gives partial credit: (right picks − wrong picks) / number of correct options, floored at 0.
 * Returns null when the question must be graded by the LLM.
 */
export function scoreObjective(answer: QuestionAnswer, response: AnswerResponse | null | undefined): Score | null {
  if (answer.type === "short") {
    if (!answer.keyPoints?.length) return null;
    return scoreKeyPoints(answer.keyPoints, response?.type === "short" ? response.text : "");
  }
  if (!response || response.type !== answer.type) return { score: 0, verdict: "incorrect" };

  switch (answer.type) {
    case "mcq": {
      const r = response as Extract<AnswerResponse, { type: "mcq" }>;
      return r.choice === answer.correct ? { score: 1, verdict: "correct" } : { score: 0, verdict: "incorrect" };
    }
    case "tf": {
      const r = response as Extract<AnswerResponse, { type: "tf" }>;
      return r.choice === answer.correct ? { score: 1, verdict: "correct" } : { score: 0, verdict: "incorrect" };
    }
    case "multi": {
      const picked = new Set((response as Extract<AnswerResponse, { type: "multi" }>).choices);
      const correct = new Set(answer.correct);
      let right = 0;
      let wrong = 0;
      for (const p of picked) {
        if (correct.has(p)) right++;
        else wrong++;
      }
      const score = Math.max(0, (right - wrong) / correct.size);
      return { score, verdict: verdictFor(score) };
    }
    case "blank": {
      const given = normalizeAnswer((response as Extract<AnswerResponse, { type: "blank" }>).text);
      const ok = given.length > 0 && answer.accepted.some((a) => normalizeAnswer(a) === given);
      return ok ? { score: 1, verdict: "correct" } : { score: 0, verdict: "incorrect" };
    }
  }
}

/** Attempt score = mean of question scores; unanswered questions count as 0. */
export function attemptScore(scores: (number | null | undefined)[]): number {
  if (!scores.length) return 0;
  return scores.reduce<number>((a, s) => a + (s ?? 0), 0) / scores.length;
}

export function isAnswered(r: AnswerResponse | null | undefined): boolean {
  if (!r) return false;
  switch (r.type) {
    case "mcq":
    case "tf":
      return r.choice != null;
    case "multi":
      return r.choices.length > 0;
    case "short":
    case "blank":
      return r.text.trim().length > 0;
  }
}

/**
 * Grade a short answer without an AI: a key point counts when any of its
 * keywords appears in the answer (ignoring case, accents and word endings).
 */
export function scoreKeyPoints(keyPoints: KeyPoint[], text: string): Score & { comment: string } {
  const ans = normalizeAnswer(text);
  if (!ans) return { score: 0, verdict: "incorrect", comment: "Aucune réponse donnée." };
  const tokens = ans.split(" ");
  const hits = keyPoints.map((kp) => kp.keywords.some((k) => keywordMatches(normalizeAnswer(k), tokens)));
  const covered = keyPoints.filter((_, i) => hits[i]).map((k) => k.point);
  const missing = keyPoints.filter((_, i) => !hits[i]).map((k) => k.point);
  const score = Math.round((covered.length / keyPoints.length) * 100) / 100;
  const comment = !missing.length
    ? "Tu as couvert tous les points clés."
    : !covered.length
      ? `Points clés à inclure : ${missing.join(" ; ")}.`
      : `Couvert : ${covered.join(" ; ")}. Manquant : ${missing.join(" ; ")}.`;
  return { score, verdict: verdictFor(score), comment };
}

/** Every word of the keyword must appear; long words may differ in their last two letters (plural, gender, conjugation). */
export function keywordMatches(keyword: string, tokens: string[]): boolean {
  const words = keyword.split(" ").filter(Boolean);
  if (!words.length) return false;
  return words.every((w) =>
    tokens.some((t) => {
      if (t === w) return true;
      if (w.length < 5) return false;
      const stem = w.slice(0, w.length - 2);
      return t.startsWith(stem) && Math.abs(t.length - w.length) <= 3;
    }),
  );
}

/**
 * Key points made from the rubric when none were prepared (e.g. an imported file):
 * each rubric point's longer words become its keywords.
 */
export function fallbackKeyPoints(rubric: string[]): KeyPoint[] {
  return rubric.map((point) => ({
    point,
    keywords: [...new Set(normalizeAnswer(point).split(" ").filter((w) => w.length >= 5))].slice(0, 6),
  }));
}
