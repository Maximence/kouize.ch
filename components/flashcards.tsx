"use client";

import { ChevronLeftIcon, ChevronRightIcon, RotateCwIcon, ShuffleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/markdown-view";
import { QuestionImage } from "@/components/question-image";
import { StudyAnswer } from "@/components/study-answer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { recordStudyAnswer } from "@/lib/actions/study";
import { mulberry32, shuffle } from "@/lib/quiz/shuffle";
import { BLANK } from "@/lib/quiz/schemas";
import type { StudyCard } from "@/lib/study";

/**
 * Flip cards made from a quiz's questions. Space flips, ←/→ move, "Knew it" feeds
 * the review schedule (yours only: online players don't have one, `track` is off).
 */
export function Flashcards({ cards: initial, track = true }: { cards: StudyCard[]; track?: boolean }) {
  const [cards, setCards] = useState(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const card = cards[i];

  const go = useCallback(
    (d: number) => {
      setI((x) => Math.min(cards.length - 1, Math.max(0, x + d)));
      setFlipped(false);
    },
    [cards.length],
  );

  const mark = async (knew: boolean) => {
    if (!card) return;
    setKnown((k) => ({ ...k, [card.id]: knew }));
    if (track) {
      const res = await recordStudyAnswer(card.id, knew ? "correct" : "incorrect");
      if (!res.ok) toast.error(res.error);
    }
    if (i < cards.length - 1) go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,[role=dialog]")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!card) return <p className="py-12 text-center text-muted-foreground">Ce quiz n&apos;a aucune question.</p>;
  const knewCount = Object.values(known).filter(Boolean).length;

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          Carte {i + 1} / {cards.length}
        </span>
        <span>· {knewCount} sue(s)</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setCards(shuffle(cards, mulberry32(Date.now() % 2 ** 31)));
            setI(0);
            setFlipped(false);
          }}
        >
          <ShuffleIcon /> Mélanger
        </Button>
      </div>
      <button type="button" onClick={() => setFlipped((f) => !f)} className="text-left" aria-label="Retourner la carte" data-testid="flashcard">
        <Card className="min-h-64 transition-shadow hover:shadow-md">
          <CardContent className="grid gap-4">
            {!flipped ? (
              <>
                <QuestionImage id={card.imageId} alt={card.imageAlt} className="mb-3" />
                <MarkdownView source={card.prompt.replace(BLANK, "\\_\\_\\_\\_\\_\\_")} inline className="text-lg font-medium" />
                {card.options.length > 0 && card.type !== "tf" && (
                  <ol className="grid list-[upper-alpha] gap-1 pl-6 text-sm text-muted-foreground">
                    {card.options.map((o, k) => (
                      <li key={k}>
                        <MarkdownView source={o} inline />
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <RotateCwIcon className="size-3" /> Clique ou appuie sur Espace pour retourner
                </p>
              </>
            ) : (
              <StudyAnswer card={card} />
            )}
          </CardContent>
        </Card>
      </button>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => go(-1)} disabled={i === 0} aria-label="Carte précédente">
          <ChevronLeftIcon />
        </Button>
        <div className="flex flex-1 justify-center gap-2">
          <Button variant="outline" onClick={() => mark(false)}>
            Je ne savais pas
          </Button>
          <Button onClick={() => mark(true)}>Je savais</Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => go(1)} disabled={i === cards.length - 1} aria-label="Carte suivante">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
