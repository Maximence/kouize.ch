import { SparklesIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { classes } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { attemptOutcome } from "@/lib/game/queries";
import { eq } from "drizzle-orm";

/** "+40 XP · Level up · new badge · rank 2 of 14" on a player's results page. */
export function AttemptOutcome({ attemptId, playerId, classId }: { attemptId: string; playerId: string; classId: string }) {
  const o = attemptOutcome(attemptId, playerId, classId);
  if (!o) return null;
  const code = db.select({ code: classes.code }).from(classes).where(eq(classes.id, classId)).get()?.code;
  const levelUp = o.levelAfter.level > o.levelBefore.level;
  return (
    <Card className="border-primary/40 bg-primary/5" data-testid="outcome">
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-heading text-3xl text-primary tabular-nums" data-testid="xp-gained">
            +{o.gained} XP
          </p>
          <p className="text-sm text-muted-foreground">
            {o.gained > 0
              ? `Cette tentative vaut ${o.attemptXp} XP.`
              : `Cette tentative vaut ${o.attemptXp} XP : bats ton record sur ce quiz pour en gagner plus.`}
          </p>
        </div>
        {levelUp && (
          <p className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-5 text-primary" /> Niveau supérieur ! Tu es maintenant niveau {o.levelAfter.level} :{" "}
            {o.levelAfter.title}
          </p>
        )}
        {o.badges.length > 0 && (
          <ul className="flex flex-wrap gap-2" data-testid="new-badges">
            {o.badges.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
                <span className="text-xl" aria-hidden>
                  {b.emoji}
                </span>
                <span>
                  <span className="font-semibold">New badge: {b.name}</span>
                  <span className="block text-xs text-muted-foreground">{b.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {o.rank && code && (
          <Link href={`/k/${code}?tab=leaderboard`} className="flex w-fit items-center gap-1.5 text-sm hover:underline">
            <TrophyIcon className="size-4" /> Rank {o.rank} of {o.players} in the class
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
