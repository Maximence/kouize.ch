import { eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { QuizRunner, type RunnerQuestion } from "@/components/quiz-runner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Reveal } from "@/lib/actions/attempts";
import { quizHref, viewerForAttempt } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { answers, attempts, questions, quizzes } from "@/lib/db/schema";
import { sourceLinks } from "@/lib/source-links";

export const metadata: Metadata = { title: "Quiz" };

export default function AttemptPage(props: PageProps<"/attempts/[attemptId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <AttemptContent {...props} />
    </Suspense>
  );
}

async function AttemptContent(props: PageProps<"/attempts/[attemptId]">) {
  const { attemptId } = await props.params;
  await connection();
  const viewer = await viewerForAttempt(attemptId);
  if (!viewer) notFound();
  const attempt = db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  if (!attempt) notFound();
  if (attempt.finishedAt) redirect(`/attempts/${attemptId}/results`);
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).get()!;

  const rows = db.select().from(questions).where(inArray(questions.id, attempt.questionOrder)).all();
  const byId = new Map(rows.map((q) => [q.id, q]));
  const ans = db.select().from(answers).where(eq(answers.attemptId, attemptId)).all();
  const links = sourceLinks(rows.map((q) => q.sectionId));

  // Solutions are only sent for questions already checked in practice mode.
  const runnerQuestions: RunnerQuestion[] = attempt.questionOrder.flatMap((id) => {
    const q = byId.get(id);
    if (!q) return [];
    const order = attempt.optionOrders[id] ?? q.options.map((_, i) => i);
    return [
      {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        imageId: q.imageId,
        imageAlt: q.imageAlt,
        options: order.map((orig) => ({ orig, text: q.options[orig] })),
      },
    ];
  });
  const reveals: Record<string, Reveal> = {};
  if (attempt.mode === "practice") {
    for (const a of ans) {
      const q = byId.get(a.questionId);
      if (!q || !a.verdict) continue;
      reveals[q.id] = {
        score: a.score ?? 0,
        verdict: a.verdict,
        comment: a.comment,
        answer: q.answer,
        explanation: q.explanation,
        excerpt: q.excerpt,
        sectionPath: q.sectionPath,
        sourceHref: q.sectionId ? (links[q.sectionId]?.href ?? null) : null,
      };
    }
  }

  return (
    <QuizRunner
      attempt={{
        id: attempt.id,
        quizId: attempt.quizId,
        quizTitle: quiz.title,
        quizHref: quizHref(viewer, quiz.id),
        canSuggest: viewer.kind === "player",
        language: quiz.language === "fr" ? "fr" : "en",
        mode: attempt.mode,
        timeLimitSec: attempt.timeLimitSec,
        elapsedMs: attempt.elapsedMs,
        currentIndex: Math.min(attempt.currentIndex, Math.max(0, runnerQuestions.length - 1)),
      }}
      questions={runnerQuestions}
      initialResponses={Object.fromEntries(ans.filter((a) => a.response).map((a) => [a.questionId, a.response!]))}
      initialFlags={Object.fromEntries(ans.filter((a) => a.flagged).map((a) => [a.questionId, true]))}
      initialReveals={reveals}
    />
  );
}
