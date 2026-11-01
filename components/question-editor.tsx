"use client";

import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReviewQuestion } from "@/components/question-review";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteQuestion, updateQuestion } from "@/lib/actions/quizzes";
import type { Difficulty, QuestionAnswer } from "@/lib/db/schema";
import { BLANK, DIFFICULTIES, DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/quiz/schemas";

export function QuestionEditorActions({ question }: { question: ReviewQuestion }) {
  return (
    <div className="ml-auto flex gap-1">
      <QuestionEditDialog question={question} />
      <ConfirmDialog
        title="Supprimer cette question ?"
        description="Elle disparaît du quiz. Les anciennes tentatives l'affichent toujours dans leurs résultats."
        onConfirm={async () => {
          const res = await deleteQuestion(question.id);
          if (res.ok) toast.success("Question supprimée");
          else toast.error(res.error);
        }}
        trigger={
          <Button variant="ghost" size="icon-xs" aria-label="Supprimer la question">
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

function QuestionEditDialog({ question }: { question: ReviewQuestion }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState(question.prompt);
  const [difficulty, setDifficulty] = useState<Difficulty>(question.difficulty as Difficulty);
  const [options, setOptions] = useState(question.options);
  const [explanation, setExplanation] = useState(question.explanation);
  const [answer, setAnswer] = useState<QuestionAnswer>(question.answer);

  const isChoice = answer.type === "mcq" || answer.type === "multi";
  const isCorrect = (i: number) =>
    answer.type === "mcq" ? answer.correct === i : answer.type === "multi" ? answer.correct.includes(i) : false;
  const toggleCorrect = (i: number) => {
    if (answer.type === "mcq") setAnswer({ ...answer, correct: i });
    if (answer.type === "multi")
      setAnswer({
        ...answer,
        correct: answer.correct.includes(i) ? answer.correct.filter((x) => x !== i) : [...answer.correct, i].sort(),
      });
  };
  const removeOption = (i: number) => {
    setOptions(options.filter((_, j) => j !== i));
    const shift = (x: number) => (x > i ? x - 1 : x);
    if (answer.type === "mcq") setAnswer({ ...answer, correct: answer.correct === i ? 0 : shift(answer.correct) });
    if (answer.type === "multi") setAnswer({ ...answer, correct: answer.correct.filter((x) => x !== i).map(shift) });
  };

  const save = () =>
    startTransition(async () => {
      const res = await updateQuestion(question.id, { prompt, difficulty, options, explanation, answer });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Question enregistrée");
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Modifier la question">
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit question · {TYPE_LABELS[question.type]}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="q-prompt">Question</Label>
            <Textarea id="q-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
            {answer.type === "blank" && (
              <p className="text-xs text-muted-foreground">Use {BLANK} where the blank goes.</p>
            )}
          </div>

          {isChoice && (
            <div className="grid gap-2">
              <Label>Options · coche {answer.type === "mcq" ? "la bonne" : "les bonnes"}</Label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  {answer.type === "mcq" ? (
                    <input
                      type="radio"
                      name="correct"
                      aria-label={`L'option ${i + 1} est juste`}
                      checked={isCorrect(i)}
                      onChange={() => toggleCorrect(i)}
                      className="size-4 accent-emerald-600"
                    />
                  ) : (
                    <Checkbox
                      aria-label={`L'option ${i + 1} est juste`}
                      checked={isCorrect(i)}
                      onCheckedChange={() => toggleCorrect(i)}
                    />
                  )}
                  <Input value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button variant="ghost" size="icon-sm" aria-label="Retirer l'option" onClick={() => removeOption(i)} disabled={options.length <= 2}>
                    <XIcon />
                  </Button>
                </div>
              ))}
              {options.length < 6 && (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => setOptions([...options, ""])}>
                  <PlusIcon /> Ajouter une option
                </Button>
              )}
            </div>
          )}

          {answer.type === "tf" && (
            <div className="grid gap-2">
              <Label>Bonne réponse</Label>
              <Select value={answer.correct ? "true" : "false"} onValueChange={(v) => setAnswer({ type: "tf", correct: v === "true" })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{options[0] ?? "Vrai"}</SelectItem>
                  <SelectItem value="false">{options[1] ?? "Faux"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {answer.type === "short" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="q-ref">Réponse de référence</Label>
                <Textarea id="q-ref" value={answer.reference} onChange={(e) => setAnswer({ ...answer, reference: e.target.value })} rows={2} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="q-rubric">Barème (un point par ligne)</Label>
                <Textarea
                  id="q-rubric"
                  value={answer.rubric.join("\n")}
                  onChange={(e) => setAnswer({ ...answer, rubric: e.target.value.split("\n") })}
                  onBlur={() => setAnswer({ ...answer, rubric: answer.rubric.map((r) => r.trim()).filter(Boolean) })}
                  rows={3}
                />
              </div>
            </>
          )}

          {answer.type === "blank" && (
            <div className="grid gap-2">
              <Label htmlFor="q-accepted">Réponses acceptées (séparées par des virgules)</Label>
              <Input
                id="q-accepted"
                value={answer.accepted.join(", ")}
                onChange={(e) => setAnswer({ type: "blank", accepted: e.target.value.split(",").map((s) => s.trimStart()) })}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="q-expl">Explication</Label>
            <Textarea id="q-expl" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-2">
            <Label>Difficulté</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={pending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
