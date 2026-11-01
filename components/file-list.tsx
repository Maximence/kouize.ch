"use client";

import { FileTextIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteFile } from "@/lib/actions/files";
import { formatDate, plural } from "@/lib/format";
import type { FileRow } from "@/lib/queries";

export function FileList({ categoryId, files }: { categoryId: string; files: FileRow[] }) {
  if (!files.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucun fichier pour l&apos;instant.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 px-4 py-3">
          <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
          <Link href={`/c/${categoryId}/files/${f.id}`} className="min-w-0 flex-1">
            <p className="font-medium break-all hover:underline">{f.name}</p>
            <p className="text-xs text-muted-foreground">
              {plural(f.sectionCount, "section")} · updated {formatDate(f.updatedAt)}
            </p>
          </Link>
          <Badge variant="secondary">v{f.latestVersion}</Badge>
          <ConfirmDialog
            title={`Supprimer « ${f.name} » ?`}
            description={
              f.dependentQuizzes.length ? (
                <div className="grid gap-2">
                  <p>
                    {plural(f.dependentQuizzes.length, "quiz", "quiz")} utilise(nt) ce fichier. Leurs questions sont gardées, mais
                    les liens vers les sections sources ne marcheront plus :
                  </p>
                  <ul className="list-disc pl-5">
                    {f.dependentQuizzes.map((q) => (
                      <li key={q.id}>{q.title}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                "Toutes les versions de ce fichier seront supprimées."
              )
            }
            onConfirm={async () => {
              const res = await deleteFile(f.id);
              if (res.ok) toast.success(`${f.name} supprimé`);
              else toast.error(res.error);
            }}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${f.name}`}>
                <Trash2Icon />
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
