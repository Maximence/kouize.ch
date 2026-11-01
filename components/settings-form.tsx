"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  ListIcon,
  Loader2Icon,
  PlugZapIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchProviderModels,
  removeApiKey,
  saveProviderSettings,
  testProviderSettings,
} from "@/lib/actions/settings";
import { availableProviders, GROUP_LABELS, type ProviderId, type ProviderInfo } from "@/lib/llm/providers";
import type { AppSettings, Effort } from "@/lib/models";
import type { PublicProviderState } from "@/lib/settings";
import { cn } from "@/lib/utils";

const EFFORTS: { value: Effort; label: string }[] = [
  { value: "low", label: "Faible (le plus rapide)" },
  { value: "medium", label: "Moyen" },
  { value: "high", label: "Élevé (le plus soigné)" },
];

type Props = { initial: AppSettings; states: PublicProviderState[]; mock: boolean; hosted: boolean };

export function SettingsForm({ initial, states, mock, hosted }: Props) {
  const byId = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const providers = availableProviders(hosted);
  const [provider, setProvider] = useState<ProviderId>(
    providers.some((p) => p.id === initial.provider) ? initial.provider : providers[0].id,
  );
  const info = providers.find((p) => p.id === provider)!;
  const state = byId.get(provider)!;

  // Per-provider drafts so switching back and forth keeps what was typed.
  const [drafts, setDrafts] = useState<Record<string, { model: string; baseUrl: string; apiKey: string }>>(() =>
    Object.fromEntries(states.map((s) => [s.id, { model: s.model, baseUrl: s.baseUrl, apiKey: "" }])),
  );
  const draft = drafts[provider];
  const setDraft = (patch: Partial<typeof draft>) => setDrafts((d) => ({ ...d, [provider]: { ...d[provider], ...patch } }));

  const [effortGenerate, setEffortGenerate] = useState(initial.effortGenerate);
  const [effortGrade, setEffortGrade] = useState(initial.effortGrade);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [, startTransition] = useTransition();

  const input = () => ({
    provider,
    model: draft.model,
    baseUrl: draft.baseUrl,
    apiKey: draft.apiKey || undefined,
    effortGenerate,
    effortGrade,
  });

  const save = async () => {
    setBusy("save");
    const res = await saveProviderSettings(input());
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setDraft({ apiKey: "" });
    toast.success(`${info.label} est maintenant utilisé`);
  };

  const runTest = async () => {
    setBusy("test");
    setTest(null);
    const res = await testProviderSettings(input());
    setBusy(null);
    setTest(res.ok ? { ok: true, text: `Ça marche : ${res.data.model} a répondu en ${(res.data.ms / 1000).toFixed(1)} s` } : { ok: false, text: res.error });
  };

  const loadModels = async () => {
    setBusy("models");
    const res = await fetchProviderModels({ provider, baseUrl: draft.baseUrl, apiKey: draft.apiKey || undefined });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (!res.data.length) return void toast.info("Le fournisseur n'a renvoyé aucun modèle.");
    setModels((m) => ({ ...m, [provider]: res.data }));
    if (!draft.model) setDraft({ model: res.data[0] });
  };

  const modelOptions = [...new Set([...(models[provider] ?? []), ...info.modelSuggestions])];
  const groups = (["subscription", "api", "local"] as const)
    .map((g) => ({ g, items: providers.filter((p) => p.group === g) }))
    .filter((x) => x.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fournisseur d&apos;IA</CardTitle>
        <CardDescription>
          {hosted
            ? "Sert à écrire tes questions, corriger les réponses courtes et donner des conseils, facturé sur ta propre clé. Ta clé n'appartient qu'à ton compte : les autres ne peuvent ni la voir ni l'utiliser, et seuls ses 4 derniers caractères s'affichent ici."
            : "Sert à écrire les questions, corriger les réponses courtes et donner des conseils. Les clés restent dans ta base de données locale : elles ne sont jamais envoyées au navigateur ni incluses dans les sauvegardes."}
          {mock && " Le mode simulé est actif (MDQUIZ_LLM_MOCK=1) : aucun fournisseur n'est appelé pour l'instant."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {groups.map(({ g, items }) => (
          <div key={g} className="grid gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{GROUP_LABELS[g]}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((p) => (
                <ProviderTile
                  key={p.id}
                  p={p}
                  state={byId.get(p.id)!}
                  selected={p.id === provider}
                  active={p.id === initial.provider}
                  onSelect={() => {
                    setProvider(p.id);
                    setTest(null);
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="grid gap-4 rounded-lg border p-4" data-testid="provider-config">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{info.label}</p>
            {info.experimental && <Badge variant="outline">Expérimental</Badge>}
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">{info.description}</p>

          {info.kind === "cli" && <CliHelp info={info} found={state.cliFound} />}

          {info.needsKey || info.id === "custom" ? (
            <div className="grid gap-2">
              <Label htmlFor="api-key">Clé API{info.id === "custom" ? " (si nécessaire)" : ""}</Label>
              {state.keyHint && !draft.apiKey && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <KeyRoundIcon className="size-4 text-muted-foreground" />
                  <span>
                    Clé enregistrée <code>{state.keyHint}</code>
                    {state.keySource === "env" && ` (depuis ${info.envKey} dans .env.local)`}
                  </span>
                  {state.keySource === "settings" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await removeApiKey(provider);
                          if (res.ok) toast.success("Clé supprimée");
                        })
                      }
                    >
                      <Trash2Icon /> Remove
                    </Button>
                  )}
                </div>
              )}
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={state.keyHint ? "Colle une nouvelle clé pour la remplacer" : "Colle ta clé API"}
                value={draft.apiKey}
                onChange={(e) => setDraft({ apiKey: e.target.value })}
              />
              {info.keyUrl && (
                <a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline">
                  Obtenir une clé <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>
          ) : null}

          {info.baseUrlEditable && (
            <div className="grid gap-2">
              <Label htmlFor="base-url">URL de base</Label>
              <Input
                id="base-url"
                value={draft.baseUrl}
                placeholder={info.defaultBaseUrl || "https://api.example.com/v1"}
                onChange={(e) => setDraft({ baseUrl: e.target.value })}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="model">Modèle</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="model"
                list="model-options"
                value={draft.model}
                placeholder={info.kind === "cli" ? "Laisse vide pour le modèle par défaut du CLI" : "Charge la liste ou tape un identifiant de modèle"}
                onChange={(e) => setDraft({ model: e.target.value })}
                className="min-w-0 flex-1"
              />
              <datalist id="model-options">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {info.kind !== "cli" && (
                <Button variant="outline" onClick={loadModels} disabled={busy != null}>
                  {busy === "models" ? <Loader2Icon className="animate-spin" /> : <ListIcon />} Charger les modèles
                </Button>
              )}
            </div>
            {modelOptions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {modelOptions.slice(0, 12).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ model: m })}
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted",
                      draft.model === m && "border-foreground bg-muted text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
                {modelOptions.length > 12 && (
                  <span className="px-1 text-xs text-muted-foreground">+{modelOptions.length - 12} de plus : tape pour chercher</span>
                )}
              </div>
            )}
          </div>

          {info.kind === "anthropic" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <EffortSelect label="Effort pour générer les quiz" value={effortGenerate} onChange={setEffortGenerate} />
              <EffortSelect label="Effort pour la correction et les conseils" value={effortGrade} onChange={setEffortGrade} />
            </div>
          )}

          {test && (
            <p className={cn("flex items-start gap-2 text-sm", test.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")} data-testid="test-result">
              {test.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />}
              {test.text}
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={runTest} disabled={busy != null}>
          {busy === "test" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Tester
        </Button>
        <Button onClick={save} disabled={busy != null}>
          {busy === "save" && <Loader2Icon className="animate-spin" />}
          {provider === initial.provider ? "Enregistrer" : `Utiliser ${info.label}`}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProviderTile({
  p,
  state,
  selected,
  active,
  onSelect,
}: {
  p: ProviderInfo;
  state: PublicProviderState;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const status =
    p.kind === "cli"
      ? state.cliFound ? "Installé" : "Non installé"
      : p.needsKey ? (state.keyHint ? "Clé enregistrée" : "Pas de clé") : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "grid gap-1 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {p.label}
        {active && <Badge className="ml-auto">Utilisé</Badge>}
      </span>
      {status && (
        <span className={cn("text-xs", status === "Installé" || status === "Clé enregistrée" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
          {status}
        </span>
      )}
    </button>
  );
}

function CliHelp({ info, found }: { info: ProviderInfo; found: boolean | null }) {
  const claude = info.id === "claude-code";
  return (
    <div className="grid gap-1 rounded-md bg-muted/50 p-3 text-sm">
      {found ? (
        <p className="flex items-center gap-2">
          <CheckCircle2Icon className="size-4 text-emerald-600" /> {claude ? "Claude Code" : "Codex"} trouvé sur cet ordinateur.
        </p>
      ) : (
        <p className="flex items-center gap-2">
          <CircleAlertIcon className="size-4 text-amber-600" /> {claude ? "Claude Code" : "Codex"} introuvable.
        </p>
      )}
      <p className="text-muted-foreground">
        {claude ? (
          <>
            {!found && <>Installe-le depuis <a className="underline" href="https://claude.com/code" target="_blank" rel="noreferrer">claude.com/code</a>, puis </>}
            Lance <code>claude</code> une fois dans un terminal et connecte-toi avec ton compte Claude. KOUIZE le lance sans outils,
            avec tes notes comme seule entrée. Clique sur <strong>Tester</strong> pour vérifier.
          </>
        ) : (
          <>
            {!found && <>Installe-le avec <code>npm i -g @openai/codex</code>, puis </>}
            Lance <code>codex login</code> et connecte-toi avec ChatGPT. KOUIZE le lance dans un bac à sable en lecture seule. Cette option
            n&apos;a pas été testée partout : clique d&apos;abord sur <strong>Tester</strong>.
          </>
        )}
      </p>
    </div>
  );
}

function EffortSelect({ label, value, onChange }: { label: string; value: Effort; onChange: (v: Effort) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Effort)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EFFORTS.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
