import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, fileVersions, sections } from "@/lib/db/schema";

export type SourceLink = { href: string; fileName: string };

/** Link to the rendered note version a section belongs to, scrolled to that section. */
export function sourceLinks(sectionIds: (string | null)[]): Record<string, SourceLink> {
  const ids = [...new Set(sectionIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return {};
  const rows = db
    .select({
      sectionId: sections.id,
      fileId: files.id,
      fileName: files.name,
      version: fileVersions.version,
      categoryId: files.categoryId,
    })
    .from(sections)
    .innerJoin(fileVersions, eq(fileVersions.id, sections.fileVersionId))
    .innerJoin(files, eq(files.id, fileVersions.fileId))
    .where(inArray(sections.id, ids))
    .all();
  return Object.fromEntries(
    rows.map((r) => [
      r.sectionId,
      {
        href: `/c/${r.categoryId}/files/${r.fileId}?v=${r.version}&section=${r.sectionId}`,
        fileName: `${r.fileName} (v${r.version})`,
      },
    ]),
  );
}
