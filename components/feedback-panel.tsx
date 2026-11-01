"use client";

import { Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttemptFeedback } from "@/lib/db/schema";

/** Shows the stored feedback, or asks the server to write it once. */
export function FeedbackPanel({
  attemptId,
  initial,
  weakLinks,
}: {
  attemptId: string;
  initial: AttemptFeedback | null;
  weakLinks: Record<string, string>;
}) {
  const [feedback, setFeedback] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/feedback`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Impossible d'écrire les conseils");
      else setFeedback(data.feedback);
    } catch {
      setError("Impossible de joindre le serveur KOUIZE.");
    }
    setLoading(false);
  }, [attemptId]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch(`/api/attempts/${attemptId}/feedback`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? "Impossible d'écrire les conseils");
        else setFeedback(data.feedback);
      })
      .catch(() => !cancelled && setError("Impossible de joindre le serveur KOUIZE."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attemptId, initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" /> Conseils
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm" data-testid="feedback">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Rédaction de conseils personnalisés…
          </p>
        )}
        {error && (
          <div className="grid gap-2">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" size="sm" className="w-fit" onClick={load}>
              <RefreshCwIcon /> Réessayer
            </Button>
          </div>
        )}
        {feedback && (
          <>
            <MarkdownView source={feedback.summary} className="text-sm" />
            {feedback.weakSections.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">À relire :</span>
                {feedback.weakSections.map((w) =>
                  w.sectionId && weakLinks[w.sectionId] ? (
                    <Link
                      key={w.path}
                      href={weakLinks[w.sectionId]}
                      className="rounded-sm border px-2 py-0.5 text-xs hover:bg-muted"
                    >
                      {w.path.split(" > ").at(-1)}
                    </Link>
                  ) : (
                    <span key={w.path} className="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">
                      {w.path.split(" > ").at(-1)}
                    </span>
                  ),
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
