/**
 * Normalize text so an excerpt quoted by the model can be matched against the
 * raw Markdown even if formatting, quotes or whitespace differ slightly.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/ /g, " ")
    // markdown emphasis, inline code, links, headings, list/quote markers, table pipes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/^\s{0,3}(#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** Minimum share of excerpt tokens that must appear, in order-insensitive window, for a fuzzy match. */
export const FUZZY_THRESHOLD = 0.9;

/**
 * True if `excerpt` can be found in `source`: first as a normalized
 * substring, then as a sliding window with ≥90% token overlap.
 */
export function excerptInSource(excerpt: string, source: string): boolean {
  const ex = normalizeText(excerpt);
  if (ex.length < 4) return false;
  if (normalizeText(source).includes(ex)) return true;

  const exTokens = tokens(excerpt);
  const srcTokens = tokens(source);
  if (exTokens.length < 3 || srcTokens.length < exTokens.length) return false;

  const need = Math.ceil(exTokens.length * FUZZY_THRESHOLD);
  const want = new Map<string, number>();
  for (const t of exTokens) want.set(t, (want.get(t) ?? 0) + 1);

  // Window slightly larger than the excerpt to tolerate a few inserted words.
  const win = Math.ceil(exTokens.length * 1.15);
  const have = new Map<string, number>();
  let matched = 0;
  const add = (t: string, d: 1 | -1) => {
    const w = want.get(t);
    if (!w) return;
    const before = have.get(t) ?? 0;
    const after = before + d;
    have.set(t, after);
    matched += Math.min(after, w) - Math.min(before, w);
  };
  for (let i = 0; i < srcTokens.length; i++) {
    add(srcTokens[i], 1);
    if (i >= win) add(srcTokens[i - win], -1);
    if (matched >= need) return true;
  }
  return false;
}

/** Jaccard similarity of word sets, used to drop near-duplicate questions. */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a).filter((t) => t.length > 2));
  const B = new Set(tokens(b).filter((t) => t.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.8;

export function isDuplicate(prompt: string, existing: string[]): boolean {
  return existing.some((e) => similarity(prompt, e) >= DUPLICATE_THRESHOLD);
}

export type TopicKey = { prompt: string; concept: string; excerpt: string };

/**
 * Two questions on the same topic: near-identical prompts, the same named concept,
 * or the same supporting sentence from the notes (they would test the same fact).
 */
export function sameTopic(candidate: TopicKey, kept: TopicKey[]): boolean {
  return kept.some(
    (k) =>
      similarity(candidate.prompt, k.prompt) >= DUPLICATE_THRESHOLD ||
      (candidate.concept.trim() !== "" && similarity(candidate.concept, k.concept) >= CONCEPT_THRESHOLD) ||
      similarity(candidate.excerpt, k.excerpt) >= EXCERPT_THRESHOLD,
  );
}

export const CONCEPT_THRESHOLD = 0.6;
export const EXCERPT_THRESHOLD = 0.7;
