"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MarkdownView } from "@/components/markdown-view";
import { correctAnswerText } from "@/lib/quiz/answer-text";
import type { StudyCard } from "@/lib/study";

/** The back of a card: correct answer, explanation and source. */
export function StudyAnswer({ card }: { card: StudyCard }) {
  const tf = card.language === "fr" ? ["Vrai", "Faux"] : ["True", "False"];
  return (
    <div className="grid gap-2 text-sm">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Réponse</p>
        <MarkdownView source={correctAnswerText(card, tf)} inline className="font-medium" />
      </div>
      {card.explanation && <MarkdownView source={card.explanation} inline className="text-muted-foreground" />}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {card.sectionPath}
        {card.sourceHref && (
          <Link href={card.sourceHref} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
            Ouvrir dans les notes <ExternalLinkIcon className="size-3" />
          </Link>
        )}
      </p>
    </div>
  );
}
