import { ChevronLeftIcon, ChevronRightIcon, LayersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AttemptHistory } from "@/components/attempt-history";
import { PublicationChips, PublishDialog } from "@/components/publish-dialog";
import { SuggestionsPanel } from "@/components/suggestions-panel";
import { QuestionEditorActions } from "@/components/question-editor";
import { QuestionReview } from "@/components/question-review";
import { QuizActions } from "@/components/quiz-actions";
import { StartQuizButtons } from "@/components/start-quiz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, plural } from "@/lib/format";
import { requireUserId } from "@/lib/auth/session";
import { getSiteConfig } from "@/lib/publish/client";
import { publicationStates } from "@/lib/publish/status";
import { getCategory, getQuiz, getSourceLinks, listAttempts } from "@/lib/queries";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/quiz/schemas";

type Props = PageProps<"/q/[quizId]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { quizId } = await props.params;
  const data = await getQuiz(quizId);
  return { title: data?.quiz.title ?? "Quiz" };
}

export default function QuizPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
      <QuizContent {...props} />
    </Suspense>
  );
}

async function QuizContent(props: Props) {
  const { quizId } = await props.params;
  const data = await getQuiz(quizId);
  if (!data) notFound();
  const { quiz, questions } = data;
  const category = await getCategory(quiz.categoryId);
  const links = await getSourceLinks(questions.map((q) => q.sectionId));
  const attemptRows = await listAttempts(quiz.id);
  const s = quiz.settings;
  const userId = await requireUserId();
  const site = getSiteConfig(userId);
  const published = publicationStates(userId, quiz.id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href={`/c/${quiz.categoryId}?tab=quizzes`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> {category?.emoji} {category?.name}
        </Link>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="quiz-title">{quiz.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">{plural(questions.length, "question")}</Badge>
              <Badge variant="outline">{DIFFICULTY_LABELS[s.difficulty]}</Badge>
              <Badge variant="outline">{quiz.language.toUpperCase()}</Badge>
              <Badge variant="outline">Créé le {formatDate(quiz.createdAt)}</Badge>
              {s.types.length < 5 && <Badge variant="outline">{s.types.map((t) => TYPE_LABELS[t]).join(", ")}</Badge>}
            </div>
            <div className="mt-2">
              <PublicationChips items={published} />
            </div>
          </div>
          <QuizActions quiz={{ id: quiz.id, title: quiz.title, categoryId: quiz.categoryId }} />
        </div>
      </div>

      {questions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <StartQuizButtons quizId={quiz.id} />
          <Button variant="ghost" size="lg" asChild>
            <Link href={`/q/${quiz.id}/flashcards`}>
              <LayersIcon /> Fiches
            </Link>
          </Button>
          <div className="sm:ml-auto">
            <PublishDialog
              quizId={quiz.id}
              hasShort={questions.some((q) => q.type === "short")}
              siteReady={Boolean(site.url && site.token)}
              published={published}
            />
          </div>
        </div>
      )}
      {site.url && site.token && published.length > 0 && (
        <SuggestionsPanel quizId={quiz.id} questionPrompts={questions.map((q) => q.prompt)} />
      )}
      <AttemptHistory attempts={attemptRows} questionCount={questions.length} />

      {/* Collapsed by default so the answers don't spoil the next attempt. */}
      <details className="group grid gap-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold">
          <ChevronRightIcon className="size-5 transition-transform group-open:rotate-90" />
          Questions et réponses
          <span className="text-sm font-normal text-muted-foreground">· relire et modifier</span>
        </summary>
        <p className="mt-2 mb-3 text-sm text-muted-foreground">
          Corrige ce qui semble faux : modifie une question ou supprime-la. Les réponses sont cachées pendant que tu fais le quiz.
        </p>
        <div className="grid gap-3">
        {questions.map((q, i) => (
          <Card key={q.id}>
            <CardContent>
              <QuestionReview question={q} index={i} sourceHref={q.sectionId ? links[q.sectionId]?.href : undefined}>
                <QuestionEditorActions question={q} />
              </QuestionReview>
            </CardContent>
          </Card>
        ))}
        </div>
      </details>
    </div>
  );
}
