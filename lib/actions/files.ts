"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { ownsCategory, ownsFile } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { categoryImages, files } from "@/lib/db/schema";
import { MAX_FILE_BYTES, storeMarkdownFile, type UploadResult } from "@/lib/files";
import { MAX_IMAGE_BYTES, sniffImage, storeCategoryImage } from "@/lib/images";
import { fail, ok, type ActionResult } from "./result";

const UploadInput = z.array(
  z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((n) => /\.(md|markdown)$/i.test(n), "Seuls les fichiers .md sont acceptés"),
    content: z.string().max(MAX_FILE_BYTES, "Le fichier dépasse 2 Mo"),
  }),
);

export async function uploadFiles(
  categoryId: string,
  input: { name: string; content: string }[],
): Promise<ActionResult<UploadResult[]>> {
  const parsed = UploadInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!ownsCategory(await requireUserId(), categoryId)) return fail("Matière introuvable");
  const results = parsed.data.map((f) => storeMarkdownFile(categoryId, f.name, f.content));
  refresh();
  return ok(results);
}

export async function deleteFile(fileId: string): Promise<ActionResult> {
  if (!ownsFile(await requireUserId(), fileId)) return fail("Fichier introuvable");
  // Versions and sections cascade; questions keep their excerpt and get sectionId = null.
  db.delete(files).where(eq(files.id, fileId)).run();
  refresh();
  return ok();
}

/** Upload one image (a figure referenced by the notes). One per call keeps requests small. */
export async function uploadImage(categoryId: string, form: FormData): Promise<ActionResult<{ name: string }>> {
  if (!ownsCategory(await requireUserId(), categoryId)) return fail("Matière introuvable");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Aucun fichier");
  if (file.size > MAX_IMAGE_BYTES) return fail(`${file.name}: larger than 5 MB`);
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(data, file.name);
  if (!mime) return fail(`${file.name} : ce n'est pas une image PNG, JPEG, GIF, WebP ou SVG`);
  const { name } = storeCategoryImage(categoryId, file.name, data, mime);
  refresh();
  return ok({ name });
}

export async function deleteImage(categoryId: string, name: string): Promise<ActionResult> {
  if (!ownsCategory(await requireUserId(), categoryId)) return fail("Matière introuvable");
  // The image data stays: questions that already show it keep working.
  db.delete(categoryImages).where(and(eq(categoryImages.categoryId, categoryId), eq(categoryImages.name, name))).run();
  refresh();
  return ok();
}
