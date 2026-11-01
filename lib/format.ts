export function formatScore(score: number | null | undefined): string {
  return score == null ? "—" : `${Math.round(score * 100)}%`;
}

export function formatDate(value: Date | number | null | undefined): string {
  if (value == null) return "—";
  return new Date(value).toLocaleDateString("fr-CH", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | number | null | undefined): string {
  if (value == null) return "—";
  return new Date(value).toLocaleString("fr-CH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h} h ${m % 60} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}

/** French: 0 and 1 take the singular ("0 tentative", "1 question", "2 questions"). */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n <= 1 ? word : pluralWord}`;
}
