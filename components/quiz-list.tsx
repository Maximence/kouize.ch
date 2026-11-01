import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { ImportQuizButton } from "@/components/import-quiz-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatScore, plural } from "@/lib/format";
import type { QuizRow } from "@/lib/queries";

export function QuizList({ categoryId, quizzes, hasFiles }: { categoryId: string; quizzes: QuizRow[]; hasFiles: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end gap-2">
        <ImportQuizButton categoryId={categoryId} />
        {hasFiles ? (
          <Button asChild>
            <Link href={`/c/${categoryId}/quizzes/new`}>
              <PlusIcon /> Nouveau quiz
            </Link>
          </Button>
        ) : (
          <Button disabled title="Envoie d'abord un fichier">
            <PlusIcon /> Nouveau quiz
          </Button>
        )}
      </div>
      {quizzes.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Link href={`/q/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50" data-testid="quiz-row">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{q.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(q.questionCount, "question")} · {plural(q.attemptCount, "tentative")} · {formatDate(q.createdAt)}
                  </p>
                </div>
                {q.status === "generating" && <Badge variant="outline">Génération…</Badge>}
                {q.lastScore != null && (
                  <div className="text-right text-sm">
                    <p className="font-semibold">{formatScore(q.lastScore)}</p>
                    <p className="text-xs text-muted-foreground">best {formatScore(q.bestScore)}</p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {hasFiles ? "Aucun quiz pour l'instant. Génère le premier." : "Envoie des notes dans l'onglet Fichiers, puis génère un quiz."}
        </p>
      )}
    </div>
  );
}
