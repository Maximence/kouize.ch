"use client";

import { ChevronRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Difficulty, QuestionType } from "@/lib/db/schema";
import { streamGeneration } from "@/lib/generation-client";
import { MIN_SECTION_CHARS } from "@/lib/markdown/chunk";
import {
  estimateTokens,
  OUTPUT_TOKENS_PER_QUESTION,
  priceFor,
  SYSTEM_PROMPT_TOKENS,
} from "@/lib/models";
import { QUESTION_TYPES, TYPE_LABELS } from "@/lib/quiz/schemas";
import { MAX_QUESTIONS, MIN_QUESTIONS } from "@/lib/quiz/settings-schema";
import { cn } from "@/lib/utils";

type SectionInfo = { id: string; level: number; heading: string; headingPath: string; charLen: number };
type FileInfo = { id: string; name: string; version: number; sections: SectionInfo[] };

const DIFFICULTY_OPTIONS: { value: Difficulty | "mixed"; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "medium", label: "Moyen" },
  { value: "hard", label: "Difficile" },
  { value: "mixed", label: "Mélangé" },
];

export function GenerateForm({
  categoryId,
  files,
  provider,
  model,
}: {
  categoryId: string;
  files: FileInfo[];
  provider: string;
  model: string;
}) {
  const router = useRouter();
  const [fileIds, setFileIds] = useState<string[]>(files.map((f) => f.id));
  const [customSections, setCustomSections] = useState<Set<string> | null>(null);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [types, setTypes] = useState<QuestionType[]>(["mcq", "multi", "tf", "short", "blank"]);
  const [language, setLanguage] = useState<"auto" | "fr" | "en">("auto");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; lines: string[] }>({
    done: 0,
    total: 0,
    lines: [],
  });

  const selectedFiles = files.filter((f) => fileIds.includes(f.id));
  const selectedSections = useMemo(() => {
    const all = selectedFiles.flatMap((f) => f.sections);
    return customSections ? all.filter((s) => customSections.has(s.id)) : all;
  }, [selectedFiles, customSections]);

  const estimate = useMemo(() => {
    const usable = selectedSections.filter((s) => customSections || s.charLen >= MIN_SECTION_CHARS);
    const chars = usable.reduce((a, s) => a + s.charLen, 0);
    const batches = Math.max(1, Math.ceil(chars / 20_000), Math.ceil(count / 12));
    const input = estimateTokens(chars) + batches * SYSTEM_PROMPT_TOKENS;
    const output = count * OUTPUT_TOKENS_PER_QUESTION;
    const price = priceFor(provider, model);
    const cost = price ? (input * price.input + output * price.output) / 1_000_000 : null;
    return { input, output, cost, chars };
  }, [selectedSections, customSections, count, provider, model]);

  const toggleSection = (file: FileInfo, section: SectionInfo, checked: boolean) => {
    const base = customSections ?? new Set(selectedFiles.flatMap((f) => f.sections.map((s) => s.id)));
    const next = new Set(base);
    // Toggling a heading also toggles everything nested under it.
    const idx = file.sections.findIndex((s) => s.id === section.id);
    const affected = [section];
    for (let i = idx + 1; i < file.sections.length; i++) {
      const s = file.sections[i];
      if (section.level === 0 || s.level <= section.level) break;
      affected.push(s);
    }
    for (const s of affected) {
      if (checked) next.add(s.id);
      else next.delete(s.id);
    }
    setCustomSections(next);
  };

  const canSubmit = fileIds.length > 0 && types.length > 0 && selectedSections.length > 0 && !running;

  const submit = async () => {
    setRunning(true);
    setProgress({ done: 0, total: 0, lines: [] });
    const sectionIds = customSections ? selectedSections.map((s) => s.id) : null;
    const log = (line: string) => setProgress((p) => ({ ...p, lines: [...p.lines, line] }));
    let finished = false;

    await streamGeneration(
      { categoryId, settings: { fileIds, sectionIds, count, difficulty, types, language } },
      (e) => {
        switch (e.type) {
          case "start":
            setProgress({ done: 0, total: e.batches, lines: [] });
            log(`Préparation de ${e.target} questions en ${e.batches} étape${e.batches > 1 ? "s" : ""} (${e.language === "fr" ? "français" : "anglais"})…`);
            break;
          case "batch":
            setProgress((p) => ({ ...p, done: Math.min(p.done + 1, p.total) }));
            log(
              `Étape ${e.index + 1}/${e.batches} : ${e.kept} question${e.kept > 1 ? "s gardées" : " gardée"}` +
                (e.dropped ? `, ${e.dropped} écartée${e.dropped > 1 ? "s" : ""} (hors des notes ou en double)` : "") +
                (e.cached ? " · depuis le cache" : ""),
            );
            break;
          case "topup":
            setProgress((p) => ({ ...p, total: p.total + 1 }));
            log(`Génération de ${e.missing} de plus pour remplacer les questions écartées…`);
            break;
          case "done":
            finished = true;
            if (e.warning) toast.warning(e.warning);
            else toast.success(`Quiz prêt : ${e.count} questions`);
            router.push(`/q/${e.quizId}`);
            break;
          case "error":
            toast.error(e.message, { duration: 10_000 });
            log(`Error: ${e.message}`);
            break;
        }
      },
    );
    if (!finished) setRunning(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes sources</CardTitle>
            <CardDescription>Les questions sont générées uniquement à partir du contenu choisi.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {files.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={fileIds.includes(f.id)}
                  onCheckedChange={(c) => {
                    setFileIds((ids) => (c ? [...ids, f.id] : ids.filter((x) => x !== f.id)));
                    setCustomSections(null);
                  }}
                />
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground">
                  v{f.version} · {f.sections.length} sections
                </span>
              </label>
            ))}
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                Choisir des sections précises (facultatif)
                {customSections && <span className="ml-1 text-foreground">· {selectedSections.length} choisie(s)</span>}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 grid gap-4">
                {selectedFiles.map((f) => (
                  <div key={f.id} className="grid gap-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.name}</p>
                    {f.sections.map((s) => (
                      <label
                        key={s.id}
                        className={cn(
                          "flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted",
                          s.level === 2 && "pl-6",
                          s.level === 3 && "pl-11",
                        )}
                      >
                        <Checkbox
                          checked={customSections ? customSections.has(s.id) : true}
                          onCheckedChange={(c) => toggleSection(f, s, c === true)}
                        />
                        <span className={cn(s.level <= 1 && "font-medium")}>{s.heading}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {s.charLen < MIN_SECTION_CHARS ? "courte" : `${Math.round(s.charLen / 100) / 10}k car.`}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
                {customSections && (
                  <Button variant="link" size="sm" className="w-fit px-0" onClick={() => setCustomSections(null)}>
                    Revenir à toutes les sections
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Questions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="count">Nombre de questions : {count}</Label>
              <div className="flex items-center gap-3">
                <input
                  id="count"
                  type="range"
                  min={MIN_QUESTIONS}
                  max={MAX_QUESTIONS}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  aria-label="Nombre de questions"
                  min={MIN_QUESTIONS}
                  max={MAX_QUESTIONS}
                  value={count}
                  onChange={(e) => setCount(Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Number(e.target.value) || MIN_QUESTIONS)))}
                  className="w-20"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Difficulté</Label>
              <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="radiogroup">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition",
                      difficulty === d.value && "bg-background font-medium text-foreground shadow-sm",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Types de questions</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUESTION_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={types.includes(t)}
                      onCheckedChange={(c) => setTypes((ts) => (c ? [...ts, t] : ts.filter((x) => x !== t)))}
                    />
                    {TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Langue du quiz</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Comme les notes</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">Anglais</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estimation</CardTitle>
            <CardDescription>Avant d&apos;appeler l&apos;API. Rouvrir un quiz ne la rappelle jamais.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-muted-foreground">Entrée</dt>
              <dd className="text-right">~{estimate.input.toLocaleString()} tokens</dd>
              <dt className="text-muted-foreground">Sortie</dt>
              <dd className="text-right">~{estimate.output.toLocaleString()} tokens</dd>
              <dt className="text-muted-foreground">Coût</dt>
              <dd className="text-right font-medium">
                {provider === "claude-code" || provider === "codex"
                  ? "Inclus dans ton abonnement"
                  : provider === "ollama" || provider === "lmstudio" || provider === "mock"
                    ? "Gratuit (local)"
                    : estimate.cost == null
                      ? "Voir les tarifs du fournisseur"
                      : estimate.cost < 0.01
                        ? "< $0.01"
                        : `~$${estimate.cost.toFixed(2)}`}
              </dd>
              <dt className="text-muted-foreground">Modèle</dt>
              <dd className="truncate text-right text-xs" title={`${provider} · ${model}`}>
                {provider} · {model}
              </dd>
            </dl>
            <Button onClick={submit} disabled={!canSubmit} size="lg" className="w-full">
              {running ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {running ? "Génération…" : "Générer le quiz"}
            </Button>
            {(running || progress.lines.length > 0) && (
              <div className="grid gap-2" aria-live="polite">
                <Progress value={progress.total ? (progress.done / progress.total) * 100 : 5} />
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {progress.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
