import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Flashcards } from "@/components/flashcards";
import { Skeleton } from "@/components/ui/skeleton";
import { currentPlayer } from "@/lib/auth/player";
import { playableQuiz } from "@/lib/auth/viewer";
import { isHosted } from "@/lib/settings";
import { quizCards } from "@/lib/study";

export const metadata = { title: "Fiches" };

type Props = PageProps<"/k/[code]/q/[quizId]/flashcards">;

export default function PlayerFlashcardsPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-80 rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content(props: Props) {
  const { code, quizId } = await props.params;
  await connection();
  if (!isHosted()) notFound();
  const player = await currentPlayer();
  const found = player ? playableQuiz(player.id, quizId) : undefined;
  if (!found || found.cls.code !== code) notFound();
  const cards = quizCards(quizId);
  if (!cards.length) notFound();
  return (
    <div className="grid gap-4">
      <Link href={`/k/${code}/q/${quizId}`} className="w-fit text-sm text-muted-foreground hover:text-foreground">
        ← {cards[0].quizTitle}
      </Link>
      <Flashcards cards={cards} track={false} />
    </div>
  );
}
