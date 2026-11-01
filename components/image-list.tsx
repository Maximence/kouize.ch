"use client";

import { ImageIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteImage } from "@/lib/actions/files";

type Img = { name: string; url: string };

/** The subject's images, plus the ones its notes mention but that weren't uploaded. */
export function ImageList({ categoryId, images, missing }: { categoryId: string; images: Img[]; missing: string[] }) {
  if (!images.length && !missing.length) return null;
  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ImageIcon className="size-4" /> Images · {images.length}
      </h3>
      {missing.length > 0 && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground" data-testid="missing-images">
          Tes notes utilisent {missing.length === 1 ? "une image qui n'est pas encore envoyée" : "des images qui ne sont pas encore envoyées"}
           : <span className="font-medium text-foreground">{missing.join(", ")}</span>. Dépose-{missing.length === 1 ? "la" : "les"} ci-dessus.
        </p>
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((img) => (
            <li key={img.name} className="group relative overflow-hidden rounded-md border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="aspect-video w-full bg-muted object-contain" loading="lazy" />
              <div className="flex items-center gap-1 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-xs" title={img.name}>
                  {img.name}
                </span>
                <ConfirmDialog
                  title={`Retirer ${img.name} ?`}
                  description="Les notes ne l'afficheront plus. Les questions qui l'utilisent déjà continuent de l'afficher."
                  confirmLabel="Retirer"
                  onConfirm={async () => {
                    const res = await deleteImage(categoryId, img.name);
                    if (!res.ok) toast.error(res.error);
                  }}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${img.name}`}>
                      <Trash2Icon />
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
