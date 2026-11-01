"use client";

import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  FlagIcon,
  Loader2Icon,
  TimerIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QuestionImage } from "@/components/question-image";
import { SuggestFix } from "@/components/suggest-fix";
import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { saveAnswer, saveProgress, setFlag, submitAttempt, type Reveal } from "@/lib/actions/attempts";
import type { AnswerResponse, QuestionType } from "@/lib/db/schema";
import { correctAnswerText } from "@/lib/quiz/answer-text";
import { BLANK, TYPE_LABELS } from "@/lib/quiz/schemas";
import { isAnswered } from "@/lib/quiz/scoring";
import { cn } from "@/lib/utils";

export type RunnerQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  /** In display order; `orig` is the index stored in answers. */
  options: { orig: number; text: string }[];
};

type Props = {
  attempt: {
    id: string;
    quizId: string;
    /** Studio quiz page, or the class's quiz page online. */
    quizHref: string;
    /** Online players can report a problem with a question to the teacher. */
    canSuggest: boolean;
    quizTitle: string;
    language: "fr" | "en";
    mode: "practice" | "exam";
    timeLimitSec: number | null;
    elapsedMs: number;
    currentIndex: number;
  };
  questions: RunnerQuestion[];
  initialResponses: Record<string, AnswerResponse>;
  initialFlags: Record<string, boolean>;
  initialReveals: Record<string, Reveal>;
};

function emptyResponse(type: QuestionType): AnswerResponse {
  switch (type) {
    case "mcq":
      return { type, choice: null };
    case "tf":
      return { type, choice: null };
    case "multi":
      return { type, choices: [] };
    case "short":
    case "blank":
      return { type, text: "" };
  }
}

export function QuizRunner({ attempt, questions, initialResponses, initialFlags, initialReveals }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(attempt.currentIndex);
  const [responses, setResponses] = useState(initialResponses);
  const [flags, setFlags] = useState(initialFlags);
  const [reveals, setReveals] = useState(initialReveals);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(new Set<string>());

  // Active time: server total at load + time spent on this page since. Each save sends the delta.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const lastSync = useRef(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const takeDelta = () => {
    const d = Date.now() - lastSync.current;
    lastSync.current = Date.now();
    return d;
  };
  const elapsedMs = attempt.elapsedMs + (now - startedAt);
  const remainingSec =
    attempt.timeLimitSec != null ? Math.max(0, Math.ceil(attempt.timeLimitSec - elapsedMs / 1000)) : null;

  const q = questions[index];
  const response = (q && responses[q.id]) ?? (q ? emptyResponse(q.type) : null);
  const reveal = q ? reveals[q.id] : undefined;
  const practice = attempt.mode === "practice";
  const locked = practice && Boolean(reveal);
  const isLast = index === questions.length - 1;
  const answeredCount = questions.filter((x) => isAnswered(responses[x.id])).length;

  const setResponse = (r: AnswerResponse) => {
    if (!q || locked) return;
    dirty.current.add(q.id);
    setResponses((prev) => ({ ...prev, [q.id]: r }));
  };

  /** Persist the current answer if it changed (exam / navigation). */
  const persist = useCallback(
    async (targetIndex: number) => {
      if (!q) return true;
      if (dirty.current.has(q.id) && !reveals[q.id]) {
        const res = await saveAnswer(attempt.id, q.id, responses[q.id] ?? emptyResponse(q.type), {
          currentIndex: targetIndex,
          elapsedDeltaMs: takeDelta(),
        });
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        dirty.current.delete(q.id);
      } else {
        await saveProgress(attempt.id, targetIndex, takeDelta());
      }
      return true;
    },
    [attempt.id, q, responses, reveals],
  );

  const goTo = useCallback(
    async (target: number) => {
      if (busy || target < 0 || target >= questions.length || target === index) return;
      setBusy(true);
      const ok = await persist(target);
      setBusy(false);
      if (ok) setIndex(target);
    },
    [busy, index, persist, questions.length],
  );

  const check = useCallback(async () => {
    if (!q || busy || locked) return;
    setBusy(true);
    const res = await saveAnswer(attempt.id, q.id, responses[q.id] ?? emptyResponse(q.type), {
      currentIndex: index,
      elapsedDeltaMs: takeDelta(),
      check: true,
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    dirty.current.delete(q.id);
    if (res.data.reveal) setReveals((prev) => ({ ...prev, [q.id]: res.data.reveal! }));
  }, [attempt.id, busy, index, locked, q, responses]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    // Save the answer on screen first (exam mode saves on navigation only).
    if (q && dirty.current.has(q.id) && !reveals[q.id]) {
      const saved = await saveAnswer(attempt.id, q.id, responses[q.id] ?? emptyResponse(q.type), {
        currentIndex: index,
        elapsedDeltaMs: 0,
      });
      if (saved.ok) dirty.current.delete(q.id);
    }
    const res = await submitAttempt(attempt.id, takeDelta());
    if (!res.ok) {
      setSubmitting(false);
      toast.error(res.error, { duration: 10_000 });
      return;
    }
    router.push(`/attempts/${attempt.id}/results`);
  }, [attempt.id, index, q, responses, reveals, router, submitting]);

  // Exam timer: auto-submit when time runs out.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (remainingSec === 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      toast.info("Temps écoulé ! Envoi de tes réponses…");
      void submit();
    }
  }, [remainingSec, submit]);

  const toggleFlag = useCallback(async () => {
    if (!q) return;
    const next = !flags[q.id];
    setFlags((f) => ({ ...f, [q.id]: next }));
    const res = await setFlag(attempt.id, q.id, next);
    if (!res.ok) toast.error(res.error);
  }, [attempt.id, flags, q]);

  const primary = useCallback(() => {
    if (practice && !reveal) return check();
    if (isLast) return practice ? submit() : undefined;
    return goTo(index + 1);
  }, [check, goTo, index, isLast, practice, reveal, submit]);

  const pickDisplay = useCallback(
    (displayIdx: number) => {
      if (!q || locked) return;
      if (q.type === "mcq" || q.type === "tf") {
        const opt = q.options[displayIdx];
        if (!opt) return;
        setResponse(q.type === "mcq" ? { type: "mcq", choice: opt.orig } : { type: "tf", choice: opt.orig === 0 });
      } else if (q.type === "multi") {
        const opt = q.options[displayIdx];
        if (!opt) return;
        const cur = response?.type === "multi" ? response.choices : [];
        setResponse({
          type: "multi",
          choices: cur.includes(opt.orig) ? cur.filter((c) => c !== opt.orig) : [...cur, opt.orig].sort(),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, locked, response],
  );

  // Keyboard: 1–9 pick an option, Enter = check / next, ←/→ navigate, F = flag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void primary();
        }
        return;
      }
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text");
      if (el.closest("[role=dialog],[role=alertdialog]")) return;
      if (e.key === "Enter" && el.tagName !== "TEXTAREA" && el.tagName !== "BUTTON" && el.tagName !== "A") {
        e.preventDefault();
        void primary();
        return;
      }
      if (typing) return;
      if (/^[1-9]$/.test(e.key)) pickDisplay(Number(e.key) - 1);
      else if (e.key === "ArrowRight") void goTo(index + 1);
      else if (e.key === "ArrowLeft") void goTo(index - 1);
      else if (e.key.toLowerCase() === "f") void toggleFlag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, pickDisplay, primary, toggleFlag]);

  if (!q || !response) {
    return <p className="py-12 text-center text-muted-foreground">Ce quiz n&apos;a aucune question.</p>;
  }

  const unanswered = questions.length - answeredCount;
  const selected = (orig: number) =>
    response.type === "mcq" ? response.choice === orig
    : response.type === "multi" ? response.choices.includes(orig)
    : response.type === "tf" ? response.choice != null && (response.choice ? orig === 0 : orig === 1)
    : false;
  const correctOrig = (orig: number) => {
    const a = reveal?.answer;
    if (!a) return false;
    if (a.type === "mcq") return a.correct === orig;
    if (a.type === "multi") return a.correct.includes(orig);
    if (a.type === "tf") return a.correct ? orig === 0 : orig === 1;
    return false;
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div className="grid gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href={attempt.quizHref} className="min-w-0 flex-1 truncate text-muted-foreground hover:text-foreground">
            ← {attempt.quizTitle}
          </Link>
          <Badge variant="outline">{practice ? "Entraînement" : "Examen"}</Badge>
          {remainingSec != null && (
            <span
              className={cn("inline-flex items-center gap-1 font-mono tabular-nums", remainingSec < 60 && "text-red-600")}
              aria-label="Temps restant"
            >
              <TimerIcon className="size-4" />
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Progress value={((index + 1) / questions.length) * 100} className="flex-1" />
          <span className="text-sm tabular-nums text-muted-foreground" data-testid="progress-label">
            {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{TYPE_LABELS[q.type]}</Badge>
            <Button
              variant={flags[q.id] ? "secondary" : "ghost"}
              size="sm"
              className="ml-auto"
              onClick={toggleFlag}
              aria-pressed={Boolean(flags[q.id])}
              title="Marquer pour revoir (F)"
            >
              <FlagIcon className={cn(flags[q.id] && "fill-amber-500 text-amber-500")} />
              {flags[q.id] ? "Marquée" : "Marquer"}
            </Button>
          </div>

          <QuestionImage id={q.imageId} alt={q.imageAlt} />
          <div className="text-lg" data-testid="question-prompt">
            <MarkdownView source={q.prompt.replace(BLANK, "\\_\\_\\_\\_\\_\\_")} inline />
          </div>

          {(q.type === "mcq" || q.type === "multi" || q.type === "tf") && (
            <div className="grid gap-2" role={q.type === "multi" ? "group" : "radiogroup"}>
              {q.type === "multi" && (
                <p className="text-xs text-muted-foreground">
                  {"Plusieurs réponses possibles."}
                </p>
              )}
              {q.options.map((opt, i) => {
                const sel = selected(opt.orig);
                const ok = correctOrig(opt.orig);
                return (
                  <button
                    key={opt.orig}
                    type="button"
                    role={q.type === "multi" ? "checkbox" : "radio"}
                    aria-checked={sel}
                    disabled={locked}
                    onClick={() => pickDisplay(i)}
                    data-testid="option"
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default",
                      sel && !reveal && "border-primary bg-primary/5 ring-1 ring-primary",
                      reveal && ok && "border-emerald-500/60 bg-emerald-500/10",
                      reveal && sel && !ok && "border-red-500/60 bg-red-500/10",
                    )}
                  >
                    <kbd
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded border text-xs font-medium text-muted-foreground",
                        q.type === "multi" ? "rounded" : "rounded-full",
                        sel && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {i + 1}
                    </kbd>
                    <MarkdownView source={opt.text} inline className="min-w-0 flex-1 pt-0.5" />
                    {reveal && ok && <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />}
                    {reveal && sel && !ok && <XCircleIcon className="size-5 shrink-0 text-red-600" />}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "short" && response.type === "short" && (
            <Textarea
              value={response.text}
              onChange={(e) => setResponse({ type: "short", text: e.target.value })}
              placeholder="Ta réponse… (Ctrl+Entrée pour valider)"
              rows={4}
              disabled={locked}
              aria-label="Ta réponse"
              autoFocus
            />
          )}
          {q.type === "blank" && response.type === "blank" && (
            <Input
              value={response.text}
              onChange={(e) => setResponse({ type: "blank", text: e.target.value })}
              placeholder="Mot manquant"
              disabled={locked}
              aria-label="Mot manquant"
              autoFocus
              className="max-w-sm"
            />
          )}

          {reveal && (
            <RevealPanel
              reveal={reveal}
              options={q.options}
              language={attempt.language}
              suggest={attempt.canSuggest ? <SuggestFix key={q.id} questionId={q.id} /> : null}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0 || busy} aria-label="Question précédente">
          <ChevronLeftIcon /> <span className="hidden sm:inline">Précédente</span>
        </Button>
        <div className="flex-1" />
        {!practice && (
          <ConfirmDialog
            title="Envoyer tes réponses ?"
            description={
              unanswered
                ? `${unanswered} question${unanswered > 1 ? "s sont encore sans réponse et compteront" : " est encore sans réponse et comptera"} comme fausse${unanswered > 1 ? "s" : ""}.`
                : "Tu ne pourras plus modifier tes réponses ensuite."
            }
            confirmLabel="Envoyer"
            destructive={false}
            onConfirm={submit}
            trigger={
              <Button variant={isLast ? "default" : "outline"} disabled={submitting}>
                {submitting && <Loader2Icon className="animate-spin" />} Envoyer
              </Button>
            }
          />
        )}
        {practice && !reveal && (
          <Button onClick={check} disabled={busy || !isAnswered(response)} title="Entrée">
            {busy && <Loader2Icon className="animate-spin" />} Vérifier
          </Button>
        )}
        {(!practice || reveal) && !(isLast && !practice) && (
          <Button
            onClick={() => (isLast ? submit() : goTo(index + 1))}
            disabled={busy || submitting}
            title="Entrée"
            variant={practice ? "default" : "secondary"}
          >
            {submitting && <Loader2Icon className="animate-spin" />}
            {isLast ? "Voir les résultats" : "Suivante"} {!isLast && <ChevronRightIcon />}
          </Button>
        )}
      </div>

      {!practice && (
        <div className="flex flex-wrap gap-1.5" aria-label="Questions">
          {questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "relative size-8 rounded-md border text-xs tabular-nums",
                isAnswered(responses[x.id]) && "bg-muted font-medium",
                i === index && "ring-2 ring-primary",
              )}
              aria-label={`Question ${i + 1}${flags[x.id] ? " (marquée)" : ""}`}
            >
              {i + 1}
              {flags[x.id] && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>
      )}
      <p className="hidden text-center text-xs text-muted-foreground sm:block">
        Raccourcis : <kbd>1</kbd>–<kbd>{Math.max(2, Math.min(9, q.options.length || 2))}</kbd> choisir · <kbd>Entrée</kbd>{" "}
        {practice ? "vérifier / suivante" : "suivante"} · <kbd>←</kbd> <kbd>→</kbd> naviguer · <kbd>F</kbd> marquer
      </p>
    </div>
  );
}

function RevealPanel({
  reveal,
  options,
  language,
  suggest,
}: {
  reveal: Reveal;
  options: { orig: number; text: string }[];
  language: "fr" | "en";
  suggest: React.ReactNode;
}) {
  const origOptions = [...options].sort((a, b) => a.orig - b.orig).map((o) => o.text);
  const tone =
    reveal.verdict === "correct"
      ? { cls: "border-emerald-500/40 bg-emerald-500/5", icon: <CheckCircle2Icon className="size-5 text-emerald-600" />, label: "Juste" }
      : reveal.verdict === "partial"
        ? { cls: "border-amber-500/40 bg-amber-500/5", icon: <CircleAlertIcon className="size-5 text-amber-600" />, label: `Partiellement juste (${Math.round(reveal.score * 100)} %)` }
        : { cls: "border-red-500/40 bg-red-500/5", icon: <XCircleIcon className="size-5 text-red-600" />, label: "Faux" };
  const showAnswer = reveal.answer.type === "short" || reveal.answer.type === "blank" || reveal.verdict !== "correct";

  return (
    <div className={cn("grid gap-2 rounded-lg border p-4 text-sm", tone.cls)} data-testid="reveal">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 font-medium">
          {tone.icon} {tone.label}
        </p>
        {suggest && <span className="ml-auto">{suggest}</span>}
      </div>
      {reveal.comment && <p>{reveal.comment}</p>}
      {showAnswer && (reveal.answer.type === "short" || reveal.answer.type === "blank") && (
        <div>
          <span className="text-muted-foreground">{reveal.answer.type === "short" ? "Réponse de référence : " : "Réponse : "}</span>
          <MarkdownView
            source={correctAnswerText({ options: origOptions, answer: reveal.answer }, language === "fr" ? ["Vrai", "Faux"] : ["True", "False"])}
            inline
            className="inline"
          />
        </div>
      )}
      {reveal.explanation && <MarkdownView source={reveal.explanation} inline className="text-muted-foreground" />}
      <blockquote className="border-l-2 pl-3 text-xs text-muted-foreground">
        <MarkdownView source={`“${reveal.excerpt}”`} inline />
        <span className="mt-1 flex flex-wrap items-center gap-x-2">
          {reveal.sectionPath}
          {reveal.sourceHref && (
            <Link href={reveal.sourceHref} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
              Ouvrir dans les notes <ExternalLinkIcon className="size-3" />
            </Link>
          )}
        </span>
      </blockquote>
    </div>
  );
}
