"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin, createClass, newPublishToken, updateClass } from "@/lib/actions/admin";
import type { FormState } from "@/lib/actions/classes";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(adminLogin, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe admin</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" autoFocus />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        Se connecter
      </Button>
    </form>
  );
}

type ClassFields = { id: string; name: string; code: string };

/** Create a class, or edit one (an empty password keeps the current one). */
export function ClassDialog({ trigger, cls }: { trigger: React.ReactNode; cls?: ClassFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(cls?.name ?? "");
  const [code, setCode] = useState(cls?.code ?? "");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const input = { name, code, password };
      const res = cls ? await updateClass(cls.id, input) : await createClass(input);
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      setPassword("");
      if (!cls && res.data) router.push(`/admin/classes/${res.data.id}`);
      else toast.success("Classe mise à jour");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{cls ? "Modifier la classe" : "Nouvelle classe"}</DialogTitle>
            <DialogDescription>
              Les élèves rejoignent avec le code et le mot de passe. Changer le mot de passe ne retire personne parmi
              ceux qui ont déjà rejoint.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="class-name">Nom</Label>
            <Input id="class-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="M55 · Traitement du signal" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="class-code">Code</Label>
            <Input
              id="class-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="m55"
              autoCapitalize="none"
              required
            />
            <p className="text-xs text-muted-foreground">Utilisé dans le lien : /k/{code || "m55"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="class-password">{cls ? "Nouveau mot de passe (vide pour garder l'actuel)" : "Mot de passe"}</Label>
            <Input
              id="class-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required={!cls}
              minLength={4}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {cls ? "Enregistrer" : "Créer la classe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The token your studio uses to publish. Shown once after creating it. */
export function PublishTokenButton({ exists }: { exists: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  if (token) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm break-all" data-testid="publish-token">
            {token}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(token).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Colle-le dans ton studio sous Réglages → Site en ligne. Il ne sera plus affiché.
        </p>
      </div>
    );
  }
  return (
    <Button
      variant={exists ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (exists && !confirm("Créer un nouveau jeton ? L'ancien ne fonctionnera plus.")) return;
          const res = await newPublishToken();
          if (!res.ok) return void toast.error(res.error);
          setToken(res.data.token);
        })
      }
    >
      <KeyRoundIcon /> {exists ? "Remplacer le jeton de publication" : "Créer un jeton de publication"}
    </Button>
  );
}
