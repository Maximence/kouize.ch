import type { Level } from "@/lib/game/xp";

/** "Lv 3 · Highlighter" with progress to the next level. */
export function LevelBar({ xp, level, compact }: { xp: number; level: Level; compact?: boolean }) {
  return (
    <div className="grid gap-1.5" data-testid="level">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">
          Niveau {level.level} · <span className="text-muted-foreground">{level.title}</span>
        </span>
        {!compact && (
          <span className="tabular-nums text-muted-foreground">
            {xp} / {level.next} XP
          </span>
        )}
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-sm bg-muted"
        role="progressbar"
        aria-valuemin={level.floor}
        aria-valuemax={level.next}
        aria-valuenow={xp}
        aria-label="Progression vers le niveau suivant"
      >
        <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
    </div>
  );
}
