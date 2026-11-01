"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinClass, type FormState } from "@/lib/actions/classes";

/** Class code + password + the name others will see (your account's name by default). */
export function JoinForm({ code, defaultName }: { code?: string; defaultName?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinClass, null);
  return (
    <form action={action} className="grid gap-4">
      {code ? (
        <input type="hidden" name="code" value={code} />
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="code">Code de la classe</Label>
          <Input
            id="code"
            name="code"
            required
            autoCapitalize="none"
            autoComplete="off"
            placeholder="par ex. m55"
            defaultValue={state?.values?.code}
            key={`code-${state?.values?.code}`}
          />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe de la classe</Label>
        <Input id="password" name="password" type="password" required autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Ton nom</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Affiché dans le classement"
          defaultValue={state?.values?.name ?? defaultName}
          key={`name-${state?.values?.name}`}
        />
      </div>
      {state?.error && (
        <p role="alert" data-testid="join-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="font-semibold" disabled={pending}>
        Rejoindre la classe
      </Button>
    </form>
  );
}
