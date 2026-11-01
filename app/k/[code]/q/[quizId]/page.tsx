import { and, eq } from "drizzle-orm";
import { ChevronRightIcon, LayersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AttemptHistory } from "@/components/attempt-history";
import { StartQuizButtons } from "@/components/start-quiz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentPlayer } from "@/lib/auth/player";
import { playableQuiz } from "@/lib/auth/viewer";
import { OTHER_SUBJECT, classQuizzes, subjectKey } from "@/lib/classes";
import { db } from "@/lib/db";
import { attempts } from "@/lib/db/schema";
import { plural } from "@/lib/format";
import { isHosted } from "@/lib/settings";

type Props = PageProps<"/k/[code]/q/[quizId]">;

export const metadata: Metadata = { title: "Quiz" };

export default function PlayerQuizPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <PlayerQuizContent {...props} />
    </Suspense>
  );
}

async function PlayerQuizContent(props: Props) {
  const { code, quizId } = await props.params;
  await connection();
  if (!isHosted()) notFound();
  const player = await currentPlayer();
  const found = player ? playableQuiz(player.id, quizId) : undefined;
  if (!player || !found || found.cls.code !== code) notFound();
  const { quiz, cls } = found;
  const info = classQuizzes(cls.id).find((q) => q.id === quizId);
  const mine = db
    .select()
    .from(attempts)
    .where(and(eq(attempts.quizId, quizId), eq(attempts.playerId, player.id)))
    .all();
  const count = info?.questionCount ?? 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href={`/k/${cls.code}`} className="hover:text-foreground">
            {cls.name}
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link href={`/k/${cls.code}/s/${encodeURIComponent(subjectKey(quiz))}`} className="hover:text-foreground">
            {quiz.subject ? `${quiz.subject.emoji} ${quiz.subject.name}` : OTHER_SUBJECT.name}
          </Link>
        </nav>
        <h1 className="text-3xl break-words" data-testid="quiz-title">
          {quiz.title}
        </h1>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary">{plural(count, "question")}</Badge>
          <Badge variant="outline">{quiz.language.toUpperCase()}</Badge>
        </div>
      </div>
      <Card className="bg-card/60">
        <CardContent className="text-sm text-muted-foreground">
          <strong className="text-foreground">Entraînement</strong> montre la réponse après chaque question.{" "}
          <strong className="text-foreground">Examen</strong> révèle tout à la fin. Les deux comptent pour le
          classement, où seule ta meilleure tentative sur ce quiz compte.
        </CardContent>
      </Card>
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          <StartQuizButtons quizId={quiz.id} />
          <Button variant="ghost" size="lg" asChild>
            <Link href={`/k/${cls.code}/q/${quiz.id}/flashcards`}>
              <LayersIcon /> Fiches
            </Link>
          </Button>
        </div>
      )}
      <AttemptHistory attempts={mine} questionCount={count} />
    </div>
  );
}
