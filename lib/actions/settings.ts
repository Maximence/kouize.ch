"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { listProviderModels, testProvider, toLlmError } from "@/lib/llm";
import { PROVIDERS, providerInfo, type ProviderId } from "@/lib/llm/providers";
import { requireUserId } from "@/lib/auth/session";
import { deleteApiKey, getProviderConfig, isHosted, saveSettings, setApiKey } from "@/lib/settings";
import { fail, ok, type ActionResult } from "./result";

const ProviderIdSchema = z.enum(PROVIDERS.map((p) => p.id) as [ProviderId, ...ProviderId[]]);

const ProviderInput = z.object({
  provider: ProviderIdSchema,
  // Model ids: letters, digits and . _ : / - (e.g. "llama3.1:8b", "google/gemini-x").
  model: z.string().trim().max(200).regex(/^[\w.:/@-]*$/, "Ça ne ressemble pas à un identifiant de modèle"),
  baseUrl: z.string().trim().max(500),
  /** Only sent when the user typed a new key; never sent back to the browser. */
  apiKey: z.string().trim().max(500).optional(),
  effortGenerate: z.enum(["low", "medium", "high"]),
  effortGrade: z.enum(["low", "medium", "high"]),
});
export type ProviderInput = z.input<typeof ProviderInput>;

function validBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Save the active provider, its model / URL, and optionally a new API key. */
export async function saveProviderSettings(input: ProviderInput): Promise<ActionResult> {
  const parsed = ProviderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const userId = await requireUserId();
  const info = providerInfo(d.provider);
  if (info.kind === "cli" && isHosted()) return fail(`${info.label} n'est pas disponible sur une version hébergée de KOUIZE.`);
  if (info.baseUrlEditable && d.baseUrl && !validBaseUrl(d.baseUrl)) return fail("L'URL de base doit commencer par http:// ou https://");
  if (d.apiKey) setApiKey(userId, d.provider, d.apiKey);
  saveSettings(userId, {
    provider: d.provider,
    [`model.${d.provider}`]: d.model,
    ...(info.baseUrlEditable ? { [`baseUrl.${d.provider}`]: d.baseUrl } : {}),
    effortGenerate: d.effortGenerate,
    effortGrade: d.effortGrade,
  });
  refresh();
  return ok();
}

export async function removeApiKey(provider: ProviderId): Promise<ActionResult> {
  const p = ProviderIdSchema.safeParse(provider);
  if (!p.success) return fail("Fournisseur inconnu");
  deleteApiKey(await requireUserId(), p.data);
  refresh();
  return ok();
}

/** Run a tiny request with the given (possibly unsaved) settings. */
export async function testProviderSettings(input: ProviderInput): Promise<ActionResult<{ ms: number; model: string }>> {
  const parsed = ProviderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const saved = getProviderConfig(await requireUserId(), d.provider);
  const cfg = {
    ...saved,
    model: d.model,
    baseUrl: saved.info.baseUrlEditable ? d.baseUrl : saved.baseUrl,
    apiKey: d.apiKey || saved.apiKey,
  };
  const res = await testProvider(cfg);
  return res.ok ? ok({ ms: res.ms, model: res.model }) : fail(res.error);
}

export async function fetchProviderModels(
  input: Pick<ProviderInput, "provider" | "baseUrl" | "apiKey">,
): Promise<ActionResult<string[]>> {
  const p = ProviderIdSchema.safeParse(input.provider);
  if (!p.success) return fail("Fournisseur inconnu");
  const saved = getProviderConfig(await requireUserId(), p.data);
  const cfg = {
    ...saved,
    baseUrl: saved.info.baseUrlEditable && input.baseUrl ? input.baseUrl : saved.baseUrl,
    apiKey: input.apiKey?.trim() || saved.apiKey,
  };
  try {
    return ok(await listProviderModels(cfg));
  } catch (err) {
    return fail(toLlmError(err, cfg).message);
  }
}
