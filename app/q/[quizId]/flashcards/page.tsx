import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Flashcards } from "@/components/flashcards";
import { Skeleton } from "@/components/ui/skeleton";
import { flashcards } from "@/lib/study";

export const metadata = { title: "Fiches" };

export default function FlashcardsPage(props: PageProps<"/q/[quizId]/flashcards">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 rounded-lg" />}>
      <FlashcardsContent {...props} />
    </Suspense>
  );
}

async function FlashcardsContent(props: PageProps<"/q/[quizId]/flashcards">) {
  const { quizId } = await props.params;
  const cards = await flashcards(quizId);
  if (!cards.length) notFound();
  return (
    <div className="grid gap-4">
      <Link href={`/q/${quizId}`} className="w-fit text-sm text-muted-foreground hover:text-foreground">
        ← {cards[0].quizTitle}
      </Link>
      <Flashcards cards={cards} />
    </div>
  );
}
