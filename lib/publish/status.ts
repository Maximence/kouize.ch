import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { publications } from "@/lib/db/schema";
import { getSiteConfig } from "./client";
import { quizContentHash } from "./prepare";

export type PublicationState = {
  classCode: string;
  className: string;
  hidden: boolean;
  publishedAt: Date;
  /** The quiz was edited since it was published. */
  stale: boolean;
  url: string;
};

/** Where this quiz is published on the configured online site. */
export function publicationStates(userId: string, quizId: string): PublicationState[] {
  const { url } = getSiteConfig(userId);
  if (!url) return [];
  const hash = quizContentHash(quizId);
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.quizId, quizId), eq(publications.siteUrl, url)))
    .all()
    .map((p) => ({
      classCode: p.classCode,
      className: p.className || p.classCode,
      hidden: p.hidden,
      publishedAt: p.publishedAt,
      stale: p.contentHash !== hash,
      url: `${url}/k/${p.classCode}/q/${p.remoteQuizId}`,
    }));
}
