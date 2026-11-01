import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaderRow } from "@/lib/game/queries";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ week, all, me }: { week: LeaderRow[]; all: LeaderRow[]; me?: string }) {
  return (
    <Tabs defaultValue="week">
      <TabsList>
        <TabsTrigger value="week">Cette semaine</TabsTrigger>
        <TabsTrigger value="all">Depuis le début</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="pt-2">
        <Board rows={week} me={me} empty="Personne n'a encore joué cette semaine. Sois le premier !" />
      </TabsContent>
      <TabsContent value="all" className="pt-2">
        <Board rows={all} me={me} empty="Personne n'a encore joué. Sois le premier !" />
      </TabsContent>
    </Tabs>
  );
}

function Board({ rows, me, empty }: { rows: LeaderRow[]; me?: string; empty: string }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="divide-y rounded-lg border bg-card" data-testid="leaderboard">
      {rows.map((r) => (
        <li
          key={r.playerId}
          className={cn("flex items-center gap-3 px-4 py-2.5", r.playerId === me && "bg-primary/10 font-semibold")}
          data-testid="leaderboard-row"
        >
          <span className="w-8 text-center tabular-nums text-muted-foreground">{MEDALS[r.rank - 1] ?? r.rank}</span>
          <span className="min-w-0 flex-1 truncate" data-testid="leaderboard-name">
            {r.name}
            {r.playerId === me && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(toi)</span>}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {r.quizzes} {r.quizzes === 1 ? "quiz" : "quizzes"}
          </span>
          <span className="w-20 text-right font-semibold tabular-nums" data-testid="leaderboard-xp">
            {r.xp} XP
          </span>
        </li>
      ))}
    </ol>
  );
}
