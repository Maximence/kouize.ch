"use client";

import { MessageSquareWarningIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSuggestions, resolveSuggestions } from "@/lib/actions/publish";
import type { RemoteSuggestion } from "@/lib/publish/client";

const KIND_LABELS: Record<RemoteSuggestion["kind"], string> = {
  "wrong-answer": "Réponse fausse",
  unclear: "Pas clair",
  typo: "Faute",
  other: "Autre",
};

/**
 * Students' suggestions for this quiz, fetched from the online site. Fix the
 * question below, publish again, then mark the suggestion done.
 */
export function SuggestionsPanel({ quizId, questionPrompts }: { quizId: string; questionPrompts: string[] }) {
  const [items, setItems] = useState<RemoteSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetchSuggestions(quizId);
    if (!res.ok) setError(res.error);
    else {
      setError(null);
      setItems(res.data);
    }
  }, [quizId]);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions(quizId).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setItems(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (error) {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load students&apos; suggestions: {error}</p>;
  }
  if (!items?.length) return null;

  const resolve = (ids: string[], status: "done" | "dismissed") =>
    startTransition(async () => {
      const res = await resolveSuggestions(quizId, ids, status);
      if (!res.ok) return void toast.error(res.error);
      setItems((list) => list?.filter((s) => !ids.includes(s.id)) ?? null);
    });

  return (
    <Card className="border-amber-500/40" data-testid="suggestions-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareWarningIcon className="size-4" /> {items.length} suggestion{items.length > 1 ? "s" : ""} from students
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => startTransition(load)} aria-label="Actualiser">
            <RefreshCwIcon />
          </Button>
        </CardTitle>
        <CardDescription>
          Corrige la question dans « Questions et réponses » ci-dessous, clique sur <strong>Publier dans une classe → Mettre à jour en ligne</strong>, puis
          marque la suggestion comme traitée.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((s) => {
            const index = questionPrompts.indexOf(s.questionPrompt);
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {index >= 0 ? `Q${index + 1}` : "Une question modifiée depuis"} · {KIND_LABELS[s.kind]} · {s.playerName} ({s.className})
                  </p>
                  <p className="mt-1 line-clamp-2 font-medium">{s.questionPrompt}</p>
                  <p className="mt-1 whitespace-pre-wrap">“{s.message}”</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve([s.id], "done")}>
                    Traité
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve([s.id], "dismissed")}>
                    Ignorer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
