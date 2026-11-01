import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, fileVersions, sections } from "@/lib/db/schema";
import { parseMarkdown } from "@/lib/markdown/parse";

export type UploadResult = {
  name: string;
  status: "created" | "new-version" | "unchanged";
  version: number;
  sectionCount: number;
};

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Store a Markdown file in a category. Same name + different content creates
 * a new version (old quizzes keep pointing at the old version's sections);
 * identical content is a no-op.
 */
export function storeMarkdownFile(categoryId: string, name: string, content: string): UploadResult {
  const cleanName = name.trim();
  const normalized = content.replace(/\r\n?/g, "\n");
  const sha256 = createHash("sha256").update(normalized).digest("hex");
  const parsed = parseMarkdown(normalized);

  return db.transaction((tx) => {
    let file = tx
      .select()
      .from(files)
      .where(and(eq(files.categoryId, categoryId), eq(files.name, cleanName)))
      .get();
    let status: UploadResult["status"] = "new-version";
    if (!file) {
      file = tx.insert(files).values({ categoryId, name: cleanName }).returning().get();
      status = "created";
    }

    const latest = tx
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.fileId, file.id))
      .orderBy(desc(fileVersions.version))
      .limit(1)
      .get();
    if (latest?.sha256 === sha256) {
      return { name: cleanName, status: "unchanged", version: latest.version, sectionCount: parsed.length };
    }

    const version = (latest?.version ?? 0) + 1;
    const fv = tx
      .insert(fileVersions)
      .values({ fileId: file.id, version, content: normalized, sha256 })
      .returning()
      .get();
    if (parsed.length) {
      tx.insert(sections)
        .values(parsed.map((s) => ({ ...s, fileVersionId: fv.id })))
        .run();
    }
    return { name: cleanName, status, version, sectionCount: parsed.length };
  });
}
