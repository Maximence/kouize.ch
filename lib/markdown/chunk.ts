import type { Difficulty, QuestionType } from "@/lib/db/schema";

export type ChunkableSection = {
  id: string;
  headingPath: string;
  content: string;
  charLen: number;
};

export type Allocation = { sectionId: string; count: number };

/** Sections shorter than this are skipped unless the user picked them explicitly. */
export const MIN_SECTION_CHARS = 200;
/** Rough upper bound so a short section isn't asked for 10 questions. */
export const CHARS_PER_QUESTION_CAP = 250;
/** ~6k input tokens per LLM call. */
export const MAX_BATCH_CHARS = 20_000;
export const MAX_BATCH_QUESTIONS = 12;

/**
 * Spread `total` questions across sections in proportion to their length,
 * using largest-remainder rounding. Each section is capped by its length;
 * leftover questions go to sections that still have capacity.
 */
export function allocateQuestions(
  sections: ChunkableSection[],
  total: number,
  opts: { explicit?: boolean } = {},
): Allocation[] {
  const eligible = sections.filter((s) => opts.explicit || s.charLen >= MIN_SECTION_CHARS);
  // If every section is tiny, fall back to using all of them.
  const pool = eligible.length ? eligible : sections.filter((s) => s.charLen > 0);
  if (!pool.length || total <= 0) return [];

  const cap = new Map(pool.map((s) => [s.id, Math.max(1, Math.floor(s.charLen / CHARS_PER_QUESTION_CAP))]));
  const counts = new Map(pool.map((s) => [s.id, 0]));
  let remaining = Math.min(total, [...cap.values()].reduce((a, b) => a + b, 0));

  // Repeat proportional rounds over sections that still have capacity.
  while (remaining > 0) {
    const open = pool.filter((s) => counts.get(s.id)! < cap.get(s.id)!);
    const weight = open.reduce((a, s) => a + s.charLen, 0);
    const shares = open.map((s) => {
      const exact = (remaining * s.charLen) / weight;
      const room = cap.get(s.id)! - counts.get(s.id)!;
      return { s, base: Math.min(Math.floor(exact), room), frac: exact - Math.floor(exact), room };
    });
    let given = 0;
    for (const sh of shares) {
      counts.set(sh.s.id, counts.get(sh.s.id)! + sh.base);
      given += sh.base;
    }
    // Hand out the remainder by largest fractional part (ties: longer section, then order).
    const rest = shares
      .filter((sh) => sh.room > sh.base)
      .sort((a, b) => b.frac - a.frac || b.s.charLen - a.s.charLen);
    for (const sh of rest) {
      if (given >= remaining) break;
      counts.set(sh.s.id, counts.get(sh.s.id)! + 1);
      given++;
    }
    if (given === 0) break;
    remaining -= given;
  }

  return pool.map((s) => ({ sectionId: s.id, count: counts.get(s.id)! })).filter((a) => a.count > 0);
}

export type BatchPart = {
  sectionId: string;
  headingPath: string;
  content: string;
  count: number;
};

export type Batch = { parts: BatchPart[]; total: number };

/** Split an oversized section at blank lines (never inside a fenced code block). */
export function splitContent(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) return [content];
  const blocks: string[] = [];
  let current = "";
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "" && current.length >= maxChars * 0.6) {
      blocks.push(current.trim());
      current = "";
      continue;
    }
    current += line + "\n";
    if (current.length >= maxChars && !inFence) {
      blocks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks;
}

function spread(count: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (count * w) / sum);
  const out = exact.map(Math.floor);
  let left = count - out.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => ({ i, f: e - Math.floor(e) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => {
      if (left-- > 0) out[i]++;
    });
  return out;
}

/** Pack allocated sections (in document order) into LLM-sized batches. */
export function buildBatches(
  sections: ChunkableSection[],
  allocations: Allocation[],
  limits = { maxChars: MAX_BATCH_CHARS, maxQuestions: MAX_BATCH_QUESTIONS },
): Batch[] {
  const bySection = new Map(allocations.map((a) => [a.sectionId, a.count]));
  const parts: BatchPart[] = [];
  for (const s of sections) {
    const count = bySection.get(s.id);
    if (!count) continue;
    const pieces = splitContent(s.content, limits.maxChars);
    const counts = spread(count, pieces.map((p) => p.length));
    pieces.forEach((content, i) => {
      // A piece can carry more questions than one batch allows; split the count.
      let c = counts[i];
      while (c > 0) {
        const take = Math.min(c, limits.maxQuestions);
        parts.push({ sectionId: s.id, headingPath: s.headingPath, content, count: take });
        c -= take;
      }
    });
  }

  const batches: Batch[] = [];
  let cur: Batch = { parts: [], total: 0 };
  let chars = 0;
  for (const p of parts) {
    const fits = chars + p.content.length <= limits.maxChars && cur.total + p.count <= limits.maxQuestions;
    if (cur.parts.length && !fits) {
      batches.push(cur);
      cur = { parts: [], total: 0 };
      chars = 0;
    }
    cur.parts.push(p);
    cur.total += p.count;
    chars += p.content.length;
  }
  if (cur.parts.length) batches.push(cur);
  return batches;
}

/** Even split of `total` across `keys` (largest remainder, earlier keys win ties). */
export function evenSplit<K extends string>(total: number, keys: K[], weights?: number[]): Record<K, number> {
  const counts = spread(total, weights ?? keys.map(() => 1));
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]])) as Record<K, number>;
}

const MIXED_WEIGHTS: Record<Difficulty, number> = { easy: 3, medium: 4, hard: 3 };

/**
 * Per-batch mix of question types and difficulties, so the quiz as a whole
 * matches the requested proportions.
 */
export function planMix(
  batches: Batch[],
  types: QuestionType[],
  difficulty: Difficulty | "mixed",
): { types: Partial<Record<QuestionType, number>>; difficulties: Partial<Record<Difficulty, number>> }[] {
  const total = batches.reduce((a, b) => a + b.total, 0);
  const typeSlots = expand(evenSplit(total, types));
  const diffs: Difficulty[] = difficulty === "mixed" ? ["easy", "medium", "hard"] : [difficulty];
  const diffSlots = expand(evenSplit(total, diffs, diffs.map((d) => MIXED_WEIGHTS[d])));

  let offset = 0;
  return batches.map((b) => {
    const t: Partial<Record<QuestionType, number>> = {};
    const d: Partial<Record<Difficulty, number>> = {};
    for (let i = offset; i < offset + b.total; i++) {
      t[typeSlots[i]] = (t[typeSlots[i]] ?? 0) + 1;
      d[diffSlots[i]] = (d[diffSlots[i]] ?? 0) + 1;
    }
    offset += b.total;
    return { types: t, difficulties: d };
  });
}

/** Interleave counts round-robin: {a:2,b:1} → [a,b,a]. */
function expand<K extends string>(counts: Record<K, number>): K[] {
  const left = { ...counts };
  const out: K[] = [];
  const keys = Object.keys(left) as K[];
  while (keys.some((k) => left[k] > 0)) {
    for (const k of keys) {
      if (left[k] > 0) {
        out.push(k);
        left[k]--;
      }
    }
  }
  return out;
}
