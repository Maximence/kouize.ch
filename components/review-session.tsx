"use client";

import { CheckCircle2Icon, CircleAlertIcon, PartyPopperIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/markdown-view";
import { QuestionImage } from "@/components/question-image";
import { StudyAnswer } from "@/components/study-answer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { recordStudyAnswer } from "@/lib/actions/study";
import type { AnswerResponse, Verdict } from "@/lib/db/schema";
import { BLANK, TYPE_LABELS } from "@/lib/quiz/schemas";
import { isAnswered, scoreObjective } from "@/lib/quiz/scoring";
import type { StudyCard } from "@/lib/study";
import { cn } from "@/lib/utils";

function empty(card: StudyCard): AnswerResponse {
  switch (card.type) {
    case "mcq":
      return { type: "mcq", choice: null };
    case "tf":
      return { type: "tf", choice: null };
    case "multi":
      return { type: "multi", choices: [] };
    default:
      return { type: card.type, text: "" };
  }
}

/** Daily review: answer each due card; the result moves it between Leitner boxes. */
export function ReviewSession({ cards }: { cards: StudyCard[] }) {
  const [i, setI] = useState(0);
  const [response, setResponse] = useState<AnswerResponse | null>(cards[0] ? empty(cards[0]) : null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showShort, setShowShort] = useState(false);
  const [results, setResults] = useState<Verdict[]>([]);
  const [pending, startTransition] = useTransition();

  const card = cards[i];
  if (!card || !response) {
    const correct = results.filter((r) => r === "correct").length;
    return (
      <Card>
        <CardContent className="grid place-items-center gap-3 py-12 text-center">
          <PartyPopperIcon className="size-8 text-primary" />
          <p className="text-lg font-medium">{results.length ? "Révision terminée pour aujourd'hui !" : "Rien à réviser pour l'instant."}</p>
          {results.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {correct} of {results.length} correct. Missed cards come back tomorrow; the rest come back later.
            </p>
          )}
          <Button asChild variant="outline">
            <Link href="/">Retour aux matières</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const check = () => {
    const s = scoreObjective(card.answer, response);
    if (s) setVerdict(s.verdict);
    else setShowShort(true); // short answers are self-assessed here, no API call
  };

  const next = (v: Verdict) =>
    startTransition(async () => {
      const res = await recordStudyAnswer(card.id, v);
      if (!res.ok) return void toast.error(res.error);
      setResults((r) => [...r, v]);
      const n = cards[i + 1];
      setI(i + 1);
      setResponse(n ? empty(n) : null);
      setVerdict(null);
      setShowShort(false);
    });

  const pick = (orig: number) => {
    if (verdict) return;
    if (response.type === "mcq") setResponse({ type: "mcq", choice: orig });
    if (response.type === "tf") setResponse({ type: "tf", choice: orig === 0 });
    if (response.type === "multi")
      setResponse({
        type: "multi",
        choices: response.choices.includes(orig) ? response.choices.filter((c) => c !== orig) : [...response.choices, orig],
      });
  };
  const isSel = (orig: number) =>
    response.type === "mcq" ? response.choice === orig
    : response.type === "multi" ? response.choices.includes(orig)
    : response.type === "tf" ? response.choice != null && (response.choice ? orig === 0 : orig === 1)
    : false;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Progress value={(i / cards.length) * 100} className="flex-1" />
        <span className="text-sm tabular-nums text-muted-foreground">
          {i + 1} / {cards.length}
        </span>
      </div>
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{TYPE_LABELS[card.type]}</Badge>
            <Badge variant="outline">Box {card.box}</Badge>
            <span className="truncate text-muted-foreground">{card.quizTitle}</span>
          </div>
          <QuestionImage id={card.imageId} alt={card.imageAlt} />
          <MarkdownView source={card.prompt.replace(BLANK, "\\_\\_\\_\\_\\_\\_")} inline className="text-lg" />
          {card.options.length > 0 && (
            <div className="grid gap-2">
              {card.options.map((o, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pick(idx)}
                  data-testid="review-option"
                  className={cn(
                    "rounded-lg border px-4 py-2.5 text-left text-sm hover:bg-muted/60",
                    isSel(idx) && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <MarkdownView source={o} inline />
                </button>
              ))}
            </div>
          )}
          {response.type === "short" && (
            <Textarea
              value={response.text}
              onChange={(e) => setResponse({ type: "short", text: e.target.value })}
              disabled={showShort}
              rows={3}
              placeholder="Réponds de mémoire…"
            />
          )}
          {response.type === "blank" && (
            <Input
              value={response.text}
              onChange={(e) => setResponse({ type: "blank", text: e.target.value })}
              disabled={Boolean(verdict)}
              className="max-w-sm"
              placeholder="Mot manquant"
            />
          )}

          {verdict && (
            <div
              className={cn(
                "grid gap-2 rounded-lg border p-3",
                verdict === "correct" ? "border-emerald-500/40 bg-emerald-500/5" : verdict === "partial" ? "border-amber-500/40 bg-amber-500/5" : "border-red-500/40 bg-red-500/5",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                {verdict === "correct" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : verdict === "partial" ? <CircleAlertIcon className="size-4 text-amber-600" /> : <XCircleIcon className="size-4 text-red-600" />}
                {verdict === "correct" ? "Juste" : verdict === "partial" ? "Partiellement juste" : "Pas tout à fait"}
              </p>
              <StudyAnswer card={card} />
            </div>
          )}
          {showShort && (
            <div className="grid gap-2 rounded-lg border p-3">
              <StudyAnswer card={card} />
              <p className="text-sm font-medium">Comment ça s&apos;est passé ?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => next("incorrect")} disabled={pending}>Raté</Button>
                <Button variant="outline" onClick={() => next("partial")} disabled={pending}>En partie</Button>
                <Button onClick={() => next("correct")} disabled={pending}>Réussi</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        {!verdict && !showShort && (
          <Button onClick={check} disabled={!isAnswered(response)}>
            Vérifier
          </Button>
        )}
        {verdict && (
          <Button onClick={() => next(verdict)} disabled={pending}>
            Suivante
          </Button>
        )}
      </div>
    </div>
  );
}
