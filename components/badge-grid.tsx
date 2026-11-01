import { BADGES, BADGE_IDS } from "@/lib/game/badges";
import type { EarnedBadge } from "@/lib/game/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Earned badges in color, the rest greyed out so there's something to aim for. */
export function BadgeGrid({ earned }: { earned: EarnedBadge[] }) {
  const got = new Map(earned.map((b) => [b.id, b]));
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="badges">
      {BADGE_IDS.map((id) => {
        const b = BADGES[id];
        const e = got.get(id);
        return (
          <li
            key={id}
            className={cn("grid gap-1 rounded-lg border p-3 text-center", e ? "bg-card" : "opacity-45 grayscale")}
            data-earned={e ? "true" : "false"}
          >
            <span className="text-3xl" aria-hidden>
              {b.emoji}
            </span>
            <span className="text-sm font-semibold">{b.name}</span>
            <span className="text-xs text-muted-foreground">{b.description}</span>
            {e && <span className="text-xs text-muted-foreground">{formatDate(e.earnedAt)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
