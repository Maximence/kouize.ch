"use client";

import { GlobeIcon, PlugZapIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchRemoteClasses, saveSiteSettings } from "@/lib/actions/publish";

/** Where "Publish to class" sends quizzes, and the token the online admin page gave you. */
export function SiteSettingsCard({ url: initialUrl, hasToken }: { url: string; hasToken: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await saveSiteSettings({ url, token: token || undefined });
      if (!res.ok) return void toast.error(res.error);
      setToken("");
      toast.success("Site en ligne enregistré");
    });

  const test = () =>
    startTransition(async () => {
      if (url !== initialUrl || token) {
        const saved = await saveSiteSettings({ url, token: token || undefined });
        if (!saved.ok) return void toast.error(saved.error);
        setToken("");
      }
      const res = await fetchRemoteClasses();
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        res.data.length
          ? `Connecté : ${res.data.map((c) => c.name).join(", ")}`
          : "Connecté, mais il n'y a pas encore de classe. Crées-en une sur la page admin.",
      );
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GlobeIcon className="size-4" /> Site en ligne
        </CardTitle>
        <CardDescription>
          Publie des quiz dans tes classes sur la version en ligne de KOUIZE. Les quiz sont préparés ici avec ton fournisseur
          d&apos;IA : la version en ligne n&apos;a besoin d&apos;aucune clé API. Le jeton se trouve sur la page admin du site.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="site-url">Adresse du site</Label>
          <Input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kouize.example.ch" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="site-token">Jeton de publication</Label>
          <Input
            id="site-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? "Enregistré : colles-en un nouveau pour le remplacer" : "kzp_…"}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || !url}>
            Enregistrer
          </Button>
          <Button variant="outline" onClick={test} disabled={pending || !url}>
            <PlugZapIcon /> Tester la connexion
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
