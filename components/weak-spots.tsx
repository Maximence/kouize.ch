import Link from "next/link";
import type { WeakSpot } from "@/lib/study";
import { formatDate, formatScore } from "@/lib/format";

/** Sections sorted weakest first; bar length = accuracy across every graded answer. */
export function WeakSpots({ spots }: { spots: WeakSpot[] }) {
  if (!spots.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Termine un quiz de cette matière pour voir quelles sections retravailler.</p>;
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Réussite par section de tes notes, les plus faibles d&apos;abord.</p>
      <ul className="divide-y rounded-lg border bg-card">
        {spots.map((s) => (
          <li key={s.sectionPath} className="grid gap-1.5 px-4 py-3">
            <div className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {s.sectionPath.split(" > ").slice(0, -1).length > 0 && (
                  <span className="text-muted-foreground">{s.sectionPath.split(" > ").slice(0, -1).join(" › ")} › </span>
                )}
                <span className="font-medium">{s.sectionPath.split(" > ").at(-1)}</span>
              </span>
              <span className="w-12 text-right font-semibold tabular-nums">{formatScore(s.accuracy)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${formatScore(s.accuracy)} de réussite`}>
              <div className="h-full rounded-full bg-[var(--series-score)]" style={{ width: `${Math.max(2, s.accuracy * 100)}%` }} />
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>
                {s.answered} answer{s.answered === 1 ? "" : "s"} · last {formatDate(s.lastSeen)}
              </span>
              {s.href && (
                <Link href={s.href} className="ml-auto text-primary hover:underline">
                  Relire la section
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
