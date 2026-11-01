import type { QuestionType } from "@/lib/db/schema";

/** Small deterministic PRNG so an attempt's order can be reproduced from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Question order and, for choice questions, the display order of the
 * original option indexes. True/False keeps True first.
 */
export function planAttempt(
  questions: { id: string; type: QuestionType; options: string[] }[],
  seed: number,
  opts: { shuffleQuestions?: boolean } = {},
): { questionOrder: string[]; optionOrders: Record<string, number[]> } {
  const rand = mulberry32(seed);
  const ordered = opts.shuffleQuestions === false ? questions : shuffle(questions, rand);
  const optionOrders: Record<string, number[]> = {};
  for (const q of ordered) {
    const idx = q.options.map((_, i) => i);
    optionOrders[q.id] = q.type === "mcq" || q.type === "multi" ? shuffle(idx, rand) : idx;
  }
  return { questionOrder: ordered.map((q) => q.id), optionOrders };
}
