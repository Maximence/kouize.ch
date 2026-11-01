"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { ownsQuiz } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { categories, publications, quizzes } from "@/lib/db/schema";
import { LlmError, llmProblem, toLlmError } from "@/lib/llm";
import {
  SiteError,
  getSiteConfig,
  normalizeSiteUrl,
  remoteClasses,
  remotePublish,
  remoteSetSuggestions,
  remoteSuggestions,
  remoteUnpublish,
  type RemoteSuggestion,
  saveSiteConfig,
} from "@/lib/publish/client";
import { preparePublishPayload } from "@/lib/publish/prepare";
import type { RemoteClass } from "@/lib/publish/protocol";
import { isHosted } from "@/lib/settings";
import { fail, ok, type ActionResult } from "./result";

// Studio only: publishing goes from your computer to the online copy.

const studioOnly = () => (isHosted() ? "La publication se fait depuis ton propre ordinateur." : null);

const message = (err: unknown) => (err instanceof SiteError || err instanceof Error ? err.message : "Erreur inattendue");

export async function saveSiteSettings(input: { url: string; token?: string }): Promise<ActionResult> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  const url = normalizeSiteUrl(input.url);
  if (!url) return fail("Entre l'adresse complète, par ex. https://kouize.example.ch");
  const token = input.token?.trim();
  if (token && !/^kzp_[\w-]{20,}$/.test(token)) return fail("Ça ne ressemble pas à un jeton de publication (il commence par kzp_).");
  saveSiteConfig(await requireUserId(), url, token);
  refresh();
  return ok();
}

/** The classes on the online copy. Also used as the connection test. */
export async function fetchRemoteClasses(): Promise<ActionResult<RemoteClass[]>> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  try {
    return ok(await remoteClasses(getSiteConfig(await requireUserId())));
  } catch (err) {
    return fail(message(err));
  }
}

export async function publishQuiz(
  quizId: string,
  classCode: string,
  opts: { includeShort: boolean },
): Promise<ActionResult<{ url: string; created: boolean }>> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  const userId = await requireUserId();
  if (!ownsQuiz(userId, quizId)) return fail("Quiz introuvable");
  const cfg = getSiteConfig(userId);

  let prepared;
  try {
    const problem = llmProblem(userId);
    if (problem) return fail(`Préparer le quiz pour la version en ligne nécessite ton fournisseur d'IA. ${problem}`);
    prepared = await preparePublishPayload(userId, quizId, opts);
  } catch (err) {
    const e = toLlmError(err);
    return fail(e instanceof LlmError ? `Impossible de préparer le quiz : ${e.message}` : message(err));
  }
  if (!prepared) return fail("Quiz introuvable");

  try {
    const classes = await remoteClasses(cfg);
    const cls = classes.find((c) => c.code === classCode);
    if (!cls) return fail(`Il n'y a pas de classe « ${classCode} » en ligne.`);
    const res = await remotePublish(cfg, { classCode, sourceId: quizId, quiz: prepared.payload, subject: subjectOf(quizId) });
    db.insert(publications)
      .values({
        quizId,
        siteUrl: cfg.url,
        classCode,
        className: cls.name,
        remoteQuizId: res.quizId,
        contentHash: prepared.contentHash,
        hidden: false,
        publishedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [publications.quizId, publications.siteUrl, publications.classCode],
        set: { className: cls.name, remoteQuizId: res.quizId, contentHash: prepared.contentHash, hidden: false, publishedAt: new Date() },
      })
      .run();
    refresh();
    return ok({ url: res.url, created: res.created });
  } catch (err) {
    return fail(message(err));
  }
}

/** The quiz's studio subject (name, emoji, color), shown as a category online. */
function subjectOf(quizId: string) {
  const cat = db
    .select({ name: categories.name, emoji: categories.emoji, color: categories.color })
    .from(quizzes)
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(eq(quizzes.id, quizId))
    .get();
  return cat ? { name: cat.name.slice(0, 80), emoji: cat.emoji, color: cat.color } : undefined;
}

export async function unpublishQuiz(quizId: string, classCode: string): Promise<ActionResult> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  const userId = await requireUserId();
  if (!ownsQuiz(userId, quizId)) return fail("Quiz introuvable");
  const cfg = getSiteConfig(userId);
  try {
    await remoteUnpublish(cfg, classCode, quizId);
  } catch (err) {
    return fail(message(err));
  }
  db.update(publications)
    .set({ hidden: true })
    .where(and(eq(publications.quizId, quizId), eq(publications.siteUrl, cfg.url), eq(publications.classCode, classCode)))
    .run();
  refresh();
  return ok();
}

/** Students' open suggestions on the online copies of this quiz. */
export async function fetchSuggestions(quizId: string): Promise<ActionResult<RemoteSuggestion[]>> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  const userId = await requireUserId();
  if (!ownsQuiz(userId, quizId)) return fail("Quiz introuvable");
  try {
    return ok(await remoteSuggestions(getSiteConfig(userId), quizId));
  } catch (err) {
    return fail(message(err));
  }
}

export async function resolveSuggestions(quizId: string, ids: string[], status: "done" | "dismissed"): Promise<ActionResult> {
  const denied = studioOnly();
  if (denied) return fail(denied);
  const userId = await requireUserId();
  if (!ownsQuiz(userId, quizId)) return fail("Quiz introuvable");
  try {
    await remoteSetSuggestions(getSiteConfig(userId), ids, status);
    return ok();
  } catch (err) {
    return fail(message(err));
  }
}
