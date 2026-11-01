import { eq, inArray } from "drizzle-orm";
import { FlagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FeedbackPanel } from "@/components/feedback-panel";
import { OverrideButton } from "@/components/override-button";
import { QuestionReview } from "@/components/question-review";
import { ResultsFilter } from "@/components/results-filter";
import { RetryMistakesButton } from "@/components/retry-mistakes-button";
import { StartQuizButtons } from "@/components/start-quiz";
import { SuggestFix } from "@/components/suggest-fix";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AttemptOutcome } from "@/components/attempt-outcome";
import { quizHref, viewerForAttempt } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { answers, attempts, questions, quizzes } from "@/lib/db/schema";
import { formatDateTime, formatDuration, formatScore } from "@/lib/format";
import { sourceLinks } from "@/lib/source-links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Résultats" };

type Props = PageProps<"/attempts/[attemptId]/results">;

export default function ResultsPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ResultsContent {...props} />
    </Suspense>
  );
}

async function ResultsContent(props: Props) {
  const { attemptId } = await props.params;
  const { show } = await props.searchParams;
  await connection();
  const viewer = await viewerForAttempt(attemptId);
  if (!viewer) notFound();
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt) notFound();
  if (!attempt.finishedAt) redirect(`/attempts/${attemptId}`);
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).get()!;
  const qs = db.select().from(questions).where(inArray(questions.id, attempt.questionOrder)).all();
  const byId = new Map(qs.map((q) => [q.id, q]));
  const ans = new Map(db.select().from(answers).where(eq(answers.attemptId, attemptId)).all().map((a) => [a.questionId, a]));
  const links = sourceLinks(qs.map((q) => q.sectionId));

  const rows = attempt.questionOrder.flatMap((id, i) => {
    const q = byId.get(id);
    return q ? [{ q, a: ans.get(id), index: i }] : [];
  });
  const counts = {
    correct: rows.filter((r) => r.a?.verdict === "correct").length,
    partial: rows.filter((r) => r.a?.verdict === "partial").length,
    incorrect: rows.filter((r) => r.a?.verdict !== "correct" && r.a?.verdict !== "partial").length,
    flagged: rows.filter((r) => r.a?.flagged).length,
  };
  const filter = show === "wrong" || show === "flagged" ? show : "all";
  const visible = rows.filter((r) =>
    filter === "wrong" ? r.a?.verdict !== "correct" : filter === "flagged" ? r.a?.flagged : true,
  );
  const weakLinks = Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v.href]));
  const pct = Math.round((attempt.score ?? 0) * 100);
  // Online players: no "retry my mistakes" (it creates quizzes) and no "I was right" (it would change the leaderboard).
  const isPlayer = viewer.kind === "player";

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link href={quizHref(viewer, quiz.id)} className="w-fit text-sm text-muted-foreground hover:text-foreground">
          ← {quiz.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Résultats</h1>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div
            className="grid size-24 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-primary) ${pct * 3.6}deg, var(--color-muted) 0)`,
            }}
          >
            <div className="grid size-20 place-items-center rounded-full bg-card">
              <span className="text-2xl font-semibold tabular-nums" data-testid="score">
                {formatScore(attempt.score)}
              </span>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Stat label="Justes" value={`${counts.correct} / ${rows.length}`} />
            <Stat label="Partielles" value={String(counts.partial)} />
            <Stat label="Temps" value={formatDuration(attempt.elapsedMs)} />
            <Stat label="Mode" value={attempt.mode === "exam" ? "Examen" : "Entraînement"} />
          </dl>
          <p className="w-full text-xs text-muted-foreground">Finished {formatDateTime(attempt.finishedAt)}</p>
          <div className="flex w-full flex-wrap gap-2">
            <StartQuizButtons quizId={quiz.id} compact />
            {!isPlayer && counts.correct < rows.length && <RetryMistakesButton attemptId={attempt.id} />}
          </div>
        </CardContent>
      </Card>

      {attempt.playerId && quiz.classId && (
        <AttemptOutcome attemptId={attempt.id} playerId={attempt.playerId} classId={quiz.classId} />
      )}

      <FeedbackPanel attemptId={attempt.id} initial={attempt.feedback ?? null} weakLinks={weakLinks} />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Réponses</h2>
          <ResultsFilter
            current={filter}
            counts={{ all: rows.length, wrong: rows.length - counts.correct, flagged: counts.flagged }}
          />
        </div>
        {visible.map(({ q, a, index }) => (
          <Card
            key={q.id}
            className={cn(
              "border-l-4",
              a?.verdict === "correct" ? "border-l-emerald-500" : a?.verdict === "partial" ? "border-l-amber-500" : "border-l-red-500",
            )}
          >
            <CardContent>
              <QuestionReview
                question={q}
                index={index}
                response={a?.response ?? null}
                sourceHref={q.sectionId ? links[q.sectionId]?.href : undefined}
                hideMissingSource={Boolean(quiz.classId)}
              >
                <VerdictBadge verdict={a?.verdict ?? "incorrect"} score={a?.score ?? 0} />
                {isPlayer && (
                  <span className="ml-auto">
                    <SuggestFix questionId={q.id} />
                  </span>
                )}
                {a?.flagged && (
                  <Badge variant="outline" className="gap-1">
                    <FlagIcon className="size-3 fill-amber-500 text-amber-500" /> Marquée
                  </Badge>
                )}
              </QuestionReview>
              {(q.type === "short" || q.type === "blank") && (
                <div className="mt-3 grid gap-2 rounded-md bg-muted/50 p-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Ta réponse : </span>
                    {a?.response && "text" in a.response && a.response.text.trim() ? a.response.text : <em>pas de réponse</em>}
                  </p>
                  {a?.comment && <p className="text-muted-foreground">{a.comment}</p>}
                  {!isPlayer && a?.verdict !== "correct" && <OverrideButton attemptId={attempt.id} questionId={q.id} />}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">Rien à afficher ici.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function VerdictBadge({ verdict, score }: { verdict: string; score: number }) {
  if (verdict === "correct") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">Juste</Badge>;
  if (verdict === "partial") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Partielle · {Math.round(score * 100)} %</Badge>;
  return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200">Fausse</Badge>;
}
