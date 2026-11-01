import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassQuiz } from "@/lib/classes";
import { formatScore, plural } from "@/lib/format";

/** Quiz cards of a class, with the player's best score and XP. */
export function ClassQuizCards({ code, quizzes, xpByQuiz }: { code: string; quizzes: ClassQuiz[]; xpByQuiz: Map<string, number> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {quizzes.map((q) => (
        <Link key={q.id} href={`/k/${code}/q/${q.id}`} className="group" data-testid="class-quiz">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-start gap-2 text-lg break-words">
                <span className="flex-1">{q.title}</span>
                {!q.attempts && <Badge className="shrink-0">Nouveau</Badge>}
              </CardTitle>
              <CardDescription>
                {plural(q.questionCount, "question")} · {q.language.toUpperCase()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4 text-sm">
              <span>
                Best: <span className="font-semibold tabular-nums">{formatScore(q.best)}</span>
              </span>
              <span className="ml-auto font-semibold tabular-nums text-primary">
                {xpByQuiz.has(q.id) ? `${xpByQuiz.get(q.id)} XP` : ""}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

type Group = { key: string; name: string; emoji: string; color: string; quizzes: ClassQuiz[] };

/** The class's subjects: click one to see its quizzes. */
export function SubjectCards({ code, groups }: { code: string; groups: Group[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => {
        const played = g.quizzes.filter((q) => q.attempts > 0).length;
        const fresh = g.quizzes.length - played;
        return (
          <Link key={g.key} href={`/k/${code}/s/${encodeURIComponent(g.key)}`} className="group" data-testid="class-subject">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-start gap-3 text-lg">
                  <span className="grid size-12 shrink-0 place-items-center rounded-md text-2xl" style={{ backgroundColor: `${g.color}66` }}>
                    {g.emoji}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{g.name}</span>
                  {fresh > 0 && <Badge className="shrink-0">{fresh} nouveau{fresh > 1 ? "x" : ""}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <span className="text-muted-foreground">
                  {plural(g.quizzes.length, "quiz", "quiz")} · {played} joué{played > 1 ? "s" : ""}
                </span>
                <div className="h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
                  <div className="h-full bg-primary" style={{ width: `${Math.round((played / g.quizzes.length) * 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
