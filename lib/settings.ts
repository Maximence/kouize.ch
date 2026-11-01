import "server-only";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSecrets, userSettings } from "@/lib/db/schema";
import { findCli } from "@/lib/llm/cli";
import { availableProviders, providerInfo, type ProviderId, type ProviderInfo } from "@/lib/llm/providers";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/models";

// Every user picks their own provider and brings their own keys.

function readAll(userId: string): Record<string, string> {
  return Object.fromEntries(
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).all().map((r) => [r.key, r.value]),
  );
}

export function getSettings(userId: string): AppSettings {
  const s = readAll(userId);
  return {
    provider: providerInfo(s.provider ?? DEFAULT_SETTINGS.provider).id,
    effortGenerate: (s.effortGenerate as AppSettings["effortGenerate"]) ?? DEFAULT_SETTINGS.effortGenerate,
    effortGrade: (s.effortGrade as AppSettings["effortGrade"]) ?? DEFAULT_SETTINGS.effortGrade,
  };
}

export function saveSettings(userId: string, values: Record<string, string | null | undefined>) {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) continue;
      tx.insert(userSettings)
        .values({ userId, key, value })
        .onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value } })
        .run();
    }
  });
}

// ---------- API keys ----------

const secretKey = (provider: ProviderId) => `apiKey.${provider}`;

export function setApiKey(userId: string, provider: ProviderId, value: string) {
  db.insert(userSecrets)
    .values({ userId, key: secretKey(provider), value })
    .onConflictDoUpdate({ target: [userSecrets.userId, userSecrets.key], set: { value, updatedAt: new Date() } })
    .run();
}

export function deleteApiKey(userId: string, provider: ProviderId) {
  db.delete(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, secretKey(provider))))
    .run();
}

function storedKeys(userId: string): Map<string, string> {
  return new Map(
    db
      .select()
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), like(userSecrets.key, "apiKey.%")))
      .all()
      .map((r) => [r.key.slice("apiKey.".length), r.value]),
  );
}

// ---------- Resolved provider config (server only: contains the key) ----------

export type ProviderConfig = {
  info: ProviderInfo;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  keySource: "settings" | "env" | null;
};

export function getProviderConfig(
  userId: string,
  id: ProviderId,
  cache?: { s: Record<string, string>; keys: Map<string, string> },
): ProviderConfig {
  const s = cache?.s ?? readAll(userId);
  const keys = cache?.keys ?? storedKeys(userId);
  const info = providerInfo(id);
  const saved = keys.get(id);
  // A key in the server's environment would be shared by every account, so only use it locally.
  const env = info.envKey && !isHosted() ? process.env[info.envKey]?.trim() : undefined;
  return {
    info,
    model: s[`model.${id}`] ?? info.defaultModel,
    baseUrl: (info.baseUrlEditable ? s[`baseUrl.${id}`] : undefined) ?? info.defaultBaseUrl ?? "",
    apiKey: saved || env || null,
    keySource: saved ? "settings" : env ? "env" : null,
  };
}

export function getActiveProvider(userId: string): ProviderConfig {
  return getProviderConfig(userId, getSettings(userId).provider);
}

/** Why the provider can't be used yet, phrased for the user; null when ready. */
export const isHosted = () => process.env.KOUIZE_HOSTED === "1";

export function providerProblem(cfg: ProviderConfig): string | null {
  const name = cfg.info.label;
  if (cfg.info.kind === "cli" && isHosted()) {
    return `${name} only works when KOUIZE runs on your own computer. Pick an API key provider in Settings.`;
  }
  if (cfg.info.kind === "cli") {
    if (!findCli(cfg.info.id === "codex" ? "codex" : "claude")) {
      return cfg.info.id === "codex"
        ? "Le CLI Codex n'est pas installé. Installe-le (`npm i -g @openai/codex`), lance `codex login`, puis recharge la page."
        : "Le CLI Claude Code n'est pas installé. Installe-le depuis claude.com/code, lance `claude` une fois pour te connecter, puis recharge la page.";
    }
    return null;
  }
  if (cfg.info.needsKey && !cfg.apiKey) return `Ajoute ta clé ${name} dans les Réglages pour générer des quiz.`;
  if (cfg.info.id === "custom" && !cfg.baseUrl) return "Indique l'URL de base de ton API compatible OpenAI dans les Réglages.";
  if (!cfg.model) return `Choisis un modèle ${name} dans les Réglages.`;
  return null;
}

/** What the settings page may see: never the key itself, only its last characters. */
export type PublicProviderState = {
  id: ProviderId;
  model: string;
  baseUrl: string;
  keyHint: string | null;
  keySource: ProviderConfig["keySource"];
  cliFound: boolean | null;
};

export function publicProviderStates(userId: string): PublicProviderState[] {
  const cache = { s: readAll(userId), keys: storedKeys(userId) };
  return availableProviders(isHosted()).map((p) => {
    const cfg = getProviderConfig(userId, p.id, cache);
    return {
      id: p.id,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      keyHint: cfg.apiKey ? `…${cfg.apiKey.slice(-4)}` : null,
      keySource: cfg.keySource,
      cliFound: p.kind === "cli" ? Boolean(findCli(p.id === "codex" ? "codex" : "claude")) : null,
    };
  });
}
