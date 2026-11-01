"use client";

import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, logIn, renameAccount, restorePlayer, signUp } from "@/lib/actions/account";
import type { FormState } from "@/lib/actions/classes";

function FormError({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" data-testid="auth-error" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

const withNext = (path: string, next?: string) => (next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path);

export function SignUpForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="grid gap-1.5">
        <Label htmlFor="name">Ton nom</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Affiché dans les classements"
          defaultValue={state?.values?.name}
          key={`name-${state?.values?.name}`}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state?.values?.email ?? email}
          key={`email-${state?.values?.email}`}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">Au moins 8 caractères.</p>
      </div>
      <FormError state={state} />
      <Button type="submit" size="lg" className="font-semibold" disabled={pending}>
        Créer mon compte
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href={withNext("/login", next)} className="font-medium text-foreground underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logIn, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state?.values?.email ?? email}
          key={`email-${state?.values?.email}`}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <FormError state={state} />
      <Button type="submit" size="lg" className="font-semibold" disabled={pending}>
        Se connecter
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Nouveau ici ?{" "}
        <Link href={withNext("/signup", next)} className="font-medium text-foreground underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}

/** For progress made before accounts existed: its recovery code moves it into this account. */
export function RestoreForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(restorePlayer, null);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="recovery">Code de récupération</Label>
        <Input
          id="recovery"
          name="recovery"
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="KZ-XXXX-XXXX-XXXX-XXXX"
          className="font-mono"
          defaultValue={state?.values?.recovery}
          key={state?.values?.recovery}
        />
      </div>
      <FormError state={state} />
      <Button type="submit" variant="outline" disabled={pending}>
        Récupérer ma progression ici
      </Button>
    </form>
  );
}

export function AccountName({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">{name}</span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Changer mon nom">
          <PencilIcon />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await renameAccount(value);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Nom changé. Les classes que tu rejoindras l'utiliseront.");
          setEditing(false);
        });
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={24} className="w-56" autoFocus />
      <Button type="submit" size="sm" disabled={pending}>
        Enregistrer
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Annuler
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await changePassword(current, next);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Mot de passe changé");
          setCurrent("");
          setNext("");
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="current-password">Mot de passe actuel</Label>
        <Input id="current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new-password">Nouveau mot de passe</Label>
        <Input id="new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        Changer le mot de passe
      </Button>
    </form>
  );
}
