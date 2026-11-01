import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, categoryImages } from "@/lib/db/schema";
import { imageName, imageRefs, isRemoteImage } from "@/lib/markdown/images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
export const IMAGE_MIMES = new Set(Object.values(MIME_BY_EXT));

export const imageUrl = (assetId: string) => `/api/images/${assetId}`;

/** The image type from its first bytes, so a renamed file can't pass as an image. */
export function sniffImage(data: Buffer, fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const declared = MIME_BY_EXT[ext];
  if (!declared) return null;
  const head = data.subarray(0, 16);
  const is = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  const actual = is(0x89, 0x50, 0x4e, 0x47)
    ? "image/png"
    : is(0xff, 0xd8, 0xff)
      ? "image/jpeg"
      : is(0x47, 0x49, 0x46, 0x38)
        ? "image/gif"
        : is(0x52, 0x49, 0x46, 0x46) && data.subarray(8, 12).toString("latin1") === "WEBP"
          ? "image/webp"
          : /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(data.subarray(0, 2048).toString("utf8"))
            ? "image/svg+xml"
            : null;
  return actual;
}

/** Store image bytes once (by content) and return their id. */
export function saveAsset(data: Buffer, mime: string): string {
  const id = createHash("sha256").update(data).digest("hex");
  db.insert(assets).values({ id, mime, data, bytes: data.length }).onConflictDoNothing().run();
  return id;
}

/** Add an image to a subject under its file name (replacing an image with the same name). */
export function storeCategoryImage(categoryId: string, fileName: string, data: Buffer, mime: string) {
  const name = imageName(fileName);
  const assetId = saveAsset(data, mime);
  db.insert(categoryImages)
    .values({ categoryId, name, assetId })
    .onConflictDoUpdate({ target: [categoryImages.categoryId, categoryImages.name], set: { assetId, createdAt: new Date() } })
    .run();
  return { name, assetId };
}

export function listCategoryImages(categoryId: string) {
  return db
    .select({ name: categoryImages.name, assetId: categoryImages.assetId, bytes: assets.bytes })
    .from(categoryImages)
    .innerJoin(assets, eq(assets.id, categoryImages.assetId))
    .where(eq(categoryImages.categoryId, categoryId))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** name → URL, for rendering a subject's notes. */
export function categoryImageUrls(categoryId: string): Record<string, string> {
  return Object.fromEntries(listCategoryImages(categoryId).map((i) => [i.name, imageUrl(i.assetId)]));
}

/** The asset a note's image reference points to in this subject, if it was uploaded. */
export function resolveImage(categoryId: string, src: string): string | null {
  return (
    db
      .select({ assetId: categoryImages.assetId })
      .from(categoryImages)
      .where(and(eq(categoryImages.categoryId, categoryId), eq(categoryImages.name, imageName(src))))
      .get()?.assetId ?? null
  );
}

export function getAssets(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(assets).where(inArray(assets.id, ids)).all();
}

/** Images the subject's notes (latest versions) reference but that weren't uploaded. */
export function missingImages(categoryId: string): string[] {
  const latest = db.all<{ content: string }>(sql`
    SELECT v.content FROM file_versions v
    JOIN files f ON f.id = v.file_id
    WHERE f.category_id = ${categoryId}
      AND v.version = (SELECT max(v2.version) FROM file_versions v2 WHERE v2.file_id = v.file_id)
  `);
  const have = new Set(listCategoryImages(categoryId).map((i) => i.name));
  const wanted = new Set(
    latest.flatMap((r) => imageRefs(r.content).filter((ref) => !isRemoteImage(ref.src)).map((ref) => imageName(ref.src))),
  );
  return [...wanted].filter((n) => n && !have.has(n)).sort();
}

/** The figures a quiz export needs, as base64, keyed by id. */
export function exportImages(ids: (string | null | undefined)[]): Record<string, { mime: string; data: string }> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  return Object.fromEntries(getAssets(unique).map((a) => [a.id, { mime: a.mime, data: a.data.toString("base64") }]));
}

/**
 * Store figures that came with an imported or published quiz. Each must match its id
 * (its SHA-256), be a supported image and stay under the size limit; others are skipped.
 */
export function importImages(images: Record<string, { mime: string; data: string }> | undefined): Set<string> {
  const saved = new Set<string>();
  for (const [id, img] of Object.entries(images ?? {})) {
    const data = Buffer.from(img.data, "base64");
    if (data.length > MAX_IMAGE_BYTES) continue;
    if (createHash("sha256").update(data).digest("hex") !== id) continue;
    const mime = sniffImage(data, `x.${img.mime.split("/")[1]?.replace("svg+xml", "svg").replace("jpeg", "jpg")}`);
    if (!mime || !IMAGE_MIMES.has(mime)) continue;
    saveAsset(data, mime);
    saved.add(id);
  }
  // Figures already on this server count too (e.g. published earlier).
  const missing = Object.keys(images ?? {}).filter((id) => !saved.has(id));
  for (const a of getAssets(missing)) saved.add(a.id);
  return saved;
}
