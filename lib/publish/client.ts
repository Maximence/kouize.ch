import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSecrets, userSettings } from "@/lib/db/schema";
import type { PublishRequest, PublishResponse, RemoteClass } from "./protocol";

// Your studio talks to the online copy server to server: the token never reaches the browser.

const URL_KEY = "site.url";
const TOKEN_KEY = "site.token";

export type SiteConfig = { url: string; token: string | null };

export function getSiteConfig(userId: string): SiteConfig {
  const url = db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, URL_KEY)))
    .get()?.value;
  const token = db
    .select()
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, TOKEN_KEY)))
    .get()?.value;
  return { url: url ?? "", token: token ?? null };
}

export function saveSiteConfig(userId: string, url: string, token?: string) {
  db.insert(userSettings)
    .values({ userId, key: URL_KEY, value: url })
    .onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value: url } })
    .run();
  if (token) {
    db.insert(userSecrets)
      .values({ userId, key: TOKEN_KEY, value: token })
      .onConflictDoUpdate({ target: [userSecrets.userId, userSecrets.key], set: { value: token, updatedAt: new Date() } })
      .run();
  }
}

/** "https://kouize.example.ch/anything" → "https://kouize.example.ch". */
export function normalizeSiteUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export class SiteError extends Error {}

async function call<T>(cfg: SiteConfig, path: string, body?: unknown): Promise<T> {
  if (!cfg.url) throw new SiteError("Ajoute d'abord l'adresse de ton site en ligne dans les Réglages.");
  if (!cfg.token) throw new SiteError("Ajoute d'abord ton jeton de publication dans les Réglages.");
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    throw new SiteError(`Impossible de joindre ${cfg.url}. Vérifie l'adresse et ta connexion.`);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    if (res.status === 401 && !data?.error) throw new SiteError("Le site demande un mot de passe. KOUIZE_SITE_PASSWORD y est-il défini ? Retire-le.");
    throw new SiteError(data?.error ?? `Le site a répondu par une erreur (${res.status}).`);
  }
  return data;
}

export const remoteClasses = (cfg: SiteConfig) =>
  call<{ classes: RemoteClass[] }>(cfg, "/api/publish/classes").then((d) => d.classes);

export const remotePublish = (cfg: SiteConfig, req: PublishRequest) => call<PublishResponse>(cfg, "/api/publish", req);

export const remoteUnpublish = (cfg: SiteConfig, classCode: string, sourceId: string) =>
  call<{ ok: true }>(cfg, "/api/publish/unpublish", { classCode, sourceId });

export type RemoteSuggestion = {
  id: string;
  kind: "wrong-answer" | "unclear" | "typo" | "other";
  message: string;
  createdAt: string;
  className: string;
  questionPrompt: string;
  questionDeleted: boolean;
  playerName: string;
};

export const remoteSuggestions = (cfg: SiteConfig, sourceId: string) =>
  call<{ suggestions: RemoteSuggestion[] }>(cfg, `/api/publish/suggestions?sourceId=${encodeURIComponent(sourceId)}`).then(
    (d) => d.suggestions,
  );

export const remoteSetSuggestions = (cfg: SiteConfig, ids: string[], status: "done" | "dismissed") =>
  call<{ ok: true }>(cfg, "/api/publish/suggestions", { ids, status });
