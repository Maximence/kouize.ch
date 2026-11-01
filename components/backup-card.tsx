"use client";

import { DownloadIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function BackupCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const restore = async () => {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/backup", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setFile(null);
    if (!res.ok) return void toast.error(data.error ?? "La restauration a échoué");
    toast.success("Sauvegarde restaurée");
    router.push("/");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sauvegarde et restauration</CardTitle>
        <CardDescription>
          Tout (matières, notes, quiz, tentatives, planning de révision) tient dans un seul fichier SQLite.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/api/backup" download>
            <DownloadIcon /> Télécharger une sauvegarde
          </a>
        </Button>
        <Button variant="outline" onClick={() => input.current?.click()}>
          <UploadIcon /> Restaurer une sauvegarde…
        </Button>
        <input
          ref={input}
          type="file"
          accept=".db,.sqlite,application/vnd.sqlite3"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {file && (
          <ConfirmDialog
            defaultOpen
            onOpenChange={(o) => !o && setFile(null)}
            title="Remplacer toutes les données ?"
            description={`Tout ce qui est actuellement dans KOUIZE sera remplacé par le contenu de « ${file.name} ». Télécharge d'abord une sauvegarde si tu veux le garder.`}
            confirmLabel="Restaurer"
            onConfirm={restore}
          />
        )}
      </CardContent>
    </Card>
  );
}
