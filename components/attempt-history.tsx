import { PlayIcon } from "lucide-react";
import Link from "next/link";
import { DiscardAttemptButton } from "@/components/discard-attempt-button";
import { ScoreChart } from "@/components/score-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { attempts } from "@/lib/db/schema";
import { formatDateTime, formatDuration, formatScore } from "@/lib/format";

type Attempt = typeof attempts.$inferSelect;

export function AttemptHistory({ attempts: rows, questionCount }: { attempts: Attempt[]; questionCount: number }) {
  const open = rows.filter((a) => !a.finishedAt);
  const finished = rows.filter((a) => a.finishedAt).sort((a, b) => +a.finishedAt! - +b.finishedAt!);
  const points = finished.map((a, i) => ({
    n: i + 1,
    date: formatDateTime(a.finishedAt),
    score: Math.round((a.score ?? 0) * 100),
    mode: a.mode === "exam" ? "Examen" : "Entraînement",
  }));

  return (
    <div className="grid gap-4">
      {open.map((a) => (
        <Card key={a.id} className="border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1">
              <p className="font-medium">Unfinished {a.mode === "exam" ? "exam" : "practice"} attempt</p>
              <p className="text-muted-foreground">
                Question {Math.min(a.currentIndex + 1, questionCount)} of {questionCount} · started {formatDateTime(a.startedAt)}
              </p>
            </div>
            <DiscardAttemptButton attemptId={a.id} />
            <Button asChild>
              <Link href={`/attempts/${a.id}`}>
                <PlayIcon /> Reprendre
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}

      {finished.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historique des scores</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {finished.length > 1 && <ScoreChart data={points} />}
            <ul className="divide-y text-sm">
              {[...finished].reverse().map((a, i) => (
                <li key={a.id}>
                  <Link href={`/attempts/${a.id}/results`} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                    <span className="w-8 font-mono text-xs text-muted-foreground">#{finished.length - i}</span>
                    <span className="flex-1">{formatDateTime(a.finishedAt)}</span>
                    <Badge variant="outline">{a.mode === "exam" ? "Examen" : "Entraînement"}</Badge>
                    <span className="hidden w-16 text-right text-muted-foreground sm:inline">{formatDuration(a.elapsedMs)}</span>
                    <span className="w-12 text-right font-semibold tabular-nums">{formatScore(a.score)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
