"use client";

import { UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadFiles, uploadImage } from "@/lib/actions/files";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function FileUploader({ categoryId }: { categoryId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const handle = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const md = picked.filter((f) => /\.(md|markdown)$/i.test(f.name));
    const images = picked.filter((f) => IMAGE_RE.test(f.name));
    const skipped = picked.length - md.length - images.length;
    if (skipped) toast.warning(`${skipped} fichier${skipped > 1 ? "s ignorés" : " ignoré"} : seuls les notes Markdown et les images sont acceptées`);
    const tooBig = [...md.filter((f) => f.size > MAX_BYTES), ...images.filter((f) => f.size > MAX_IMAGE_BYTES)];
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} : trop volumineux (notes 2 Mo, images 5 Mo)`);
    const okMd = md.filter((f) => f.size <= MAX_BYTES);
    const okImages = images.filter((f) => f.size <= MAX_IMAGE_BYTES);
    if (!okMd.length && !okImages.length) return;

    startTransition(async () => {
      // Images first, so the notes that reference them render right away.
      let imageCount = 0;
      for (const f of okImages) {
        const form = new FormData();
        form.append("file", f);
        const res = await uploadImage(categoryId, form);
        if (!res.ok) toast.error(res.error);
        else imageCount++;
      }
      if (imageCount) toast.success(`${imageCount} image${imageCount > 1 ? "s ajoutées" : " ajoutée"}`);
      if (!okMd.length) return;
      const payload = await Promise.all(okMd.map(async (f) => ({ name: f.name, content: await f.text() })));
      const res = await uploadFiles(categoryId, payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      for (const r of res.data) {
        if (r.status === "unchanged") toast.info(`${r.name} : inchangé (déjà v${r.version})`);
        else if (r.status === "new-version") toast.success(`${r.name} : nouvelle version v${r.version} · ${r.sectionCount} sections`);
        else toast.success(`${r.name} : ajouté · ${r.sectionCount} sections`);
      }
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50",
        dragging && "border-primary bg-muted",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <UploadIcon className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{pending ? "Envoi…" : "Dépose ici tes notes .md et leurs images, ou clique pour parcourir"}</p>
      <p className="text-xs text-muted-foreground">
        Envoyer une note du même nom crée une nouvelle version ; les anciens quiz gardent leur source. Les images sont
        reliées aux notes par leur nom de fichier (PNG, JPEG, GIF, WebP, SVG).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,text/markdown,.png,.jpg,.jpeg,.gif,.webp,.svg"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
