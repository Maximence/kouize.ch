import { CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { MarkdownView } from "@/components/markdown-view";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import type { AnswerResponse, QuestionAnswer, QuestionType } from "@/lib/db/schema";
export { correctAnswerText, responseText } from "@/lib/quiz/answer-text";
import { TYPE_LABELS } from "@/lib/quiz/schemas";
import { cn } from "@/lib/utils";

export type ReviewQuestion = {
  id: string;
  type: QuestionType;
  difficulty: string;
  prompt: string;
  options: string[];
  answer: QuestionAnswer;
  explanation: string;
  excerpt: string;
  sectionPath: string;
  imageId?: string | null;
  imageAlt?: string | null;
};

/** Full question with the correct answer marked, plus explanation and source. */
export function QuestionReview({
  question: q,
  index,
  sourceHref,
  response,
  hideMissingSource,
  children,
}: {
  question: ReviewQuestion;
  index: number;
  sourceHref?: string;
  /** Published quizzes have no notes online: don't call the source "deleted". */
  hideMissingSource?: boolean;
  /** When set, the student's choices are shown next to the correct ones. */
  response?: AnswerResponse | null;
  children?: React.ReactNode;
}) {
  const a = q.answer;
  const picked = (i: number) =>
    response?.type === "mcq" ? response.choice === i
    : response?.type === "multi" ? response.choices.includes(i)
    : response?.type === "tf" ? (response.choice === true && i === 0) || (response.choice === false && i === 1)
    : false;
  const correct = (i: number) =>
    a.type === "mcq" ? a.correct === i
    : a.type === "multi" ? a.correct.includes(i)
    : a.type === "tf" ? (a.correct ? i === 0 : i === 1)
    : false;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">Q{index + 1}</span>
        <Badge variant="secondary">{TYPE_LABELS[q.type]}</Badge>
        <Badge variant="outline" className="capitalize">{q.difficulty}</Badge>
        {children}
      </div>
      <QuestionImage id={q.imageId} alt={q.imageAlt} />
      <MarkdownView source={q.prompt} inline className="font-medium" />

      {(q.type === "mcq" || q.type === "multi" || q.type === "tf") && (
        <ul className="grid gap-1.5">
          {q.options.map((o, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                correct(i) && "border-emerald-500/50 bg-emerald-500/10",
                picked(i) && !correct(i) && "border-red-500/50 bg-red-500/10",
              )}
            >
              <span className="mt-0.5 size-4 shrink-0">
                {correct(i) ? <CheckIcon className="size-4 text-emerald-600" /> : picked(i) ? <XIcon className="size-4 text-red-600" /> : null}
              </span>
              <MarkdownView source={o} inline className="min-w-0 flex-1" />
              {picked(i) && <span className="text-xs text-muted-foreground">ta réponse</span>}
            </li>
          ))}
        </ul>
      )}
      {a.type === "short" && (
        <div className="grid gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Réponse de référence</p>
          <MarkdownView source={a.reference} inline />
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {a.rubric.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {a.type === "blank" && (
        <p className="text-sm">
          <span className="text-muted-foreground">Réponse : </span>
          <span className="font-medium text-emerald-700 dark:text-emerald-400">{a.accepted.join(" / ")}</span>
        </p>
      )}

      {q.explanation && (
        <div className="text-sm text-muted-foreground">
          <MarkdownView source={q.explanation} inline />
        </div>
      )}
      <blockquote className="border-l-2 pl-3 text-xs text-muted-foreground">
        <MarkdownView source={`“${q.excerpt}”`} inline />
        <div className="mt-1 flex flex-wrap items-center gap-x-2">
          <span>{q.sectionPath}</span>
          {sourceHref ? (
            <Link href={sourceHref} className="inline-flex items-center gap-1 text-primary hover:underline">
              Ouvrir dans les notes <ExternalLinkIcon className="size-3" />
            </Link>
          ) : hideMissingSource ? null : (
            <span className="italic">(source supprimée)</span>
          )}
        </div>
      </blockquote>
    </div>
  );
}
