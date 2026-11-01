"use client";

import { ExternalLinkIcon, Loader2Icon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { fetchRemoteClasses, publishQuiz, unpublishQuiz } from "@/lib/actions/publish";
import type { RemoteClass } from "@/lib/publish/protocol";

export type PublicationChip = {
  classCode: string;
  className: string;
  hidden: boolean;
  stale: boolean;
  url: string;
};

/** Where the quiz is online, with a warning when it changed since. */
export function PublicationChips({ items }: { items: PublicationChip[] }) {
  const live = items.filter((p) => !p.hidden);
  if (!live.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="publications">
      {live.map((p) => (
        <a key={p.classCode} href={p.url} target="_blank" rel="noreferrer">
          <Badge variant={p.stale ? "outline" : "secondary"} className="gap-1">
            {p.stale ? "⚠︎" : "●"} {p.className}
            {p.stale && <span className="font-normal">· modifications non publiées</span>}
            <ExternalLinkIcon className="size-3" />
          </Badge>
        </a>
      ))}
    </div>
  );
}

export function PublishDialog({
  quizId,
  hasShort,
  siteReady,
  published,
}: {
  quizId: string;
  hasShort: boolean;
  siteReady: boolean;
  published: PublicationChip[];
}) {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<RemoteClass[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [includeShort, setIncludeShort] = useState(true);
  const [loading, startLoading] = useTransition();
  const [pending, startTransition] = useTransition();

  const load = () =>
    startLoading(async () => {
      setError(null);
      const res = await fetchRemoteClasses();
      if (!res.ok) return void setError(res.error);
      setClasses(res.data);
      setCode((c) => c || res.data[0]?.code || "");
    });

  const isLive = (c: string) => published.some((p) => p.classCode === c && !p.hidden);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && siteReady) load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <SendIcon /> Publier dans une classe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publier dans une classe</DialogTitle>
          <DialogDescription>
            Ton fournisseur d&apos;IA prépare le quiz ici (mots-clés pour corriger les réponses courtes, conseils de révision), puis il part
            en ligne. Les élèves n&apos;ont jamais besoin de clé API. Republier le met à jour et garde les résultats de chacun.
          </DialogDescription>
        </DialogHeader>

        {!siteReady ? (
          <p className="text-sm">
            Ajoute d&apos;abord ton site en ligne et ton jeton de publication dans les{" "}
            <Link href="/settings" className="font-medium underline">
              Réglages
            </Link>
            .
          </p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Chargement de tes classes…
          </p>
        ) : error ? (
          <div className="grid gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="w-fit" onClick={load}>
              Réessayer
            </Button>
          </div>
        ) : classes && !classes.length ? (
          <p className="text-sm">Il n&apos;y a pas encore de classe en ligne. Crées-en une sur la page admin du site.</p>
        ) : classes ? (
          <div className="grid gap-4">
            <RadioGroup value={code} onValueChange={setCode} className="grid gap-2">
              {classes.map((c) => (
                <Label key={c.code} className="flex items-center gap-3 rounded-md border px-3 py-2 font-normal">
                  <RadioGroupItem value={c.code} />
                  <span className="flex-1">
                    {c.name} <span className="font-mono text-xs text-muted-foreground">/k/{c.code}</span>
                  </span>
                  {isLive(c.code) && <Badge variant="secondary">Publié</Badge>}
                </Label>
              ))}
            </RadioGroup>
            {hasShort && (
              <label className="flex items-start gap-3 text-sm">
                <Switch checked={includeShort} onCheckedChange={setIncludeShort} className="mt-0.5" />
                <span>
                  Inclure les questions à réponse courte
                  <span className="block text-xs text-muted-foreground">
                    En ligne, elles sont corrigées par mots-clés, ce qui est moins fin qu&apos;une IA. Désactive pour ne publier que les
                    autres types de questions.
                  </span>
                </span>
              </label>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {code && isLive(code) && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await unpublishQuiz(quizId, code);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Masqué pour la classe. Les résultats sont gardés.");
                  setOpen(false);
                })
              }
            >
              Dépublier
            </Button>
          )}
          <Button
            disabled={!siteReady || !code || pending || loading}
            onClick={() =>
              startTransition(async () => {
                const res = await publishQuiz(quizId, code, { includeShort });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.data.created ? "Publié !" : "Mis à jour en ligne", {
                  action: { label: "Ouvrir", onClick: () => window.open(res.data.url, "_blank") },
                });
                setOpen(false);
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {pending ? "Préparation…" : code && isLive(code) ? "Mettre à jour en ligne" : "Publier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
