import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { LOCAL_USER_ID, llmCache } from "@/lib/db/schema";
import { extractJson, findCli, parseClaudeCliOutput, runCli, subscriptionEnv } from "@/lib/llm/cli";
import { strictJsonSchema } from "@/lib/llm/json-schema";
import type { Effort } from "@/lib/models";
import { getActiveProvider, getSettings, isHosted, providerProblem, type ProviderConfig } from "@/lib/settings";

/** An error whose message is safe and useful to show to the user. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly code:
      | "no_key"
      | "auth"
      | "rate_limit"
      | "network"
      | "overloaded"
      | "invalid_output"
      | "refusal"
      | "bad_request"
      | "cli",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const isMockMode = () => process.env.MDQUIZ_LLM_MOCK === "1";

/** Why quizzes can't be generated right now (shown in the UI), or null when ready. */
export function llmProblem(userId: string): string | null {
  return isMockMode() ? null : providerProblem(getActiveProvider(userId));
}

/** Short "provider · model" label for the UI. */
export function activeModelLabel(userId: string): { provider: string; model: string } {
  if (isMockMode()) return { provider: "mock", model: "mock" };
  const cfg = getActiveProvider(userId);
  return { provider: cfg.info.id, model: cfg.model || "default" };
}

type CallOptions<S extends z.ZodType> = {
  /** Whose provider settings and API key to use. */
  userId: string;
  purpose: "generate" | "grade" | "feedback" | "prepare";
  schema: S;
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  /** Deterministic stand-in used when MDQUIZ_LLM_MOCK=1 (tests, offline demos). */
  mock: () => z.infer<S>;
  /** Skip the response cache (e.g. "regenerate"). The new result still gets cached. */
  bypassCache?: boolean;
};

export type CallResult<T> = { data: T; cached: boolean; inputTokens: number; outputTokens: number; model: string };

/**
 * The single entry point for model calls: response cache → provider request
 * with structured output → Zod validation → one retry on invalid output.
 */
export async function callStructured<S extends z.ZodType>(opts: CallOptions<S>): Promise<CallResult<z.infer<S>>> {
  // The online copy never calls an AI: its quizzes are prepared in your studio before publishing.
  if (isHosted()) throw new LlmError("La version en ligne de KOUIZE n'utilise pas d'IA.", "no_key");
  const settings = getSettings(opts.userId);
  const cfg = getActiveProvider(opts.userId);
  const model = isMockMode() ? "mock" : `${cfg.info.id}:${cfg.model || "default"}`;
  const effort = opts.effort ?? (opts.purpose === "generate" ? settings.effortGenerate : settings.effortGrade);
  // Each account has its own cache entries, paid for with its own key.
  // The local user keeps the original key format so existing entries still hit.
  const parts = [opts.purpose, model, effort, opts.system, opts.user];
  const key = createHash("sha256")
    .update(JSON.stringify(opts.userId === LOCAL_USER_ID ? parts : [opts.userId, ...parts]))
    .digest("hex");

  if (!opts.bypassCache) {
    const hit = db.select().from(llmCache).where(eq(llmCache.key, key)).get();
    if (hit) {
      const parsed = opts.schema.safeParse(hit.response);
      if (parsed.success) return { data: parsed.data, cached: true, inputTokens: 0, outputTokens: 0, model: hit.model };
    }
  }

  let result: CallResult<z.infer<S>>;
  if (isMockMode()) {
    result = { data: opts.schema.parse(opts.mock()), cached: false, inputTokens: 0, outputTokens: 0, model };
  } else {
    const problem = providerProblem(cfg);
    if (problem) throw new LlmError(problem, "no_key");
    result = await requestWithRetry(opts, cfg, effort);
  }

  db.insert(llmCache)
    .values({
      key,
      purpose: opts.purpose,
      model: result.model,
      response: result.data as object,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    })
    .onConflictDoUpdate({ target: llmCache.key, set: { response: result.data as object, createdAt: new Date() } })
    .run();
  return result;
}

type Raw = { json: unknown; inputTokens: number; outputTokens: number; model: string } | { retry: string };

async function requestWithRetry<S extends z.ZodType>(
  opts: CallOptions<S>,
  cfg: ProviderConfig,
  effort: Effort,
): Promise<CallResult<z.infer<S>>> {
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0
      ? opts.user
      : `${opts.user}\n\nYour previous response was rejected because: ${lastProblem}\nReturn a complete, valid response.`;
    const raw = await send(cfg, { schema: opts.schema, system: opts.system, user, effort, maxTokens: opts.maxTokens, purpose: opts.purpose });
    if ("retry" in raw) {
      lastProblem = raw.retry;
      continue;
    }
    const parsed = opts.schema.safeParse(raw.json);
    if (parsed.success) {
      return { data: parsed.data, cached: false, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model: raw.model };
    }
    lastProblem = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  throw new LlmError(`Le modèle a renvoyé deux fois une réponse invalide (${lastProblem}). Réessaie.`, "invalid_output");
}

type SendArgs = {
  schema: z.ZodType;
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  purpose: CallOptions<z.ZodType>["purpose"];
};

function send(cfg: ProviderConfig, a: SendArgs): Promise<Raw> {
  switch (cfg.info.kind) {
    case "anthropic":
      return sendAnthropic(cfg, a);
    case "openai-compatible":
      return sendOpenAICompatible(cfg, a);
    case "cli":
      return cfg.info.id === "codex" ? sendCodex(cfg, a) : sendClaudeCode(cfg, a);
  }
}

// ---------- Anthropic API ----------

const anthropicClients = new Map<string, Anthropic>();

async function sendAnthropic(cfg: ProviderConfig, a: SendArgs): Promise<Raw> {
  const apiKey = cfg.apiKey!;
  let client = anthropicClients.get(apiKey);
  if (!client) {
    // maxRetries: the SDK already retries 429/5xx/connection errors with backoff.
    client = new Anthropic({ apiKey, maxRetries: 2 });
    anthropicClients.set(apiKey, client);
  }
  let message;
  try {
    const stream = client.beta.messages.stream({
      model: cfg.model,
      max_tokens: a.maxTokens ?? 32_000,
      // Frozen system prompt first so it can be prompt-cached across calls.
      system: [{ type: "text", text: a.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: a.user }],
      thinking: { type: "adaptive" },
      output_config: { effort: a.effort, format: zodOutputFormat(a.schema) },
      // If the model declines for policy reasons, let the API retry on its default fallback.
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw toLlmError(err, cfg);
  }
  if (message.stop_reason === "refusal") {
    throw new LlmError("Claude a refusé de traiter ce contenu. Essaie d'autres sections ou reformule les notes.", "refusal");
  }
  if (message.stop_reason === "max_tokens") return { retry: "the output was cut off (too long). Keep explanations concise." };
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return {
      json: JSON.parse(text),
      inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
      model: message.model,
    };
  } catch {
    return { retry: "the output was not valid JSON." };
  }
}

// ---------- OpenAI and OpenAI-compatible APIs (Gemini, OpenRouter, Ollama, LM Studio…) ----------

function schemaInstruction(schema: z.ZodType): string {
  return `\n\nRespond with a single JSON object, and nothing else, that matches this JSON Schema:\n${JSON.stringify(strictJsonSchema(schema))}`;
}

async function sendOpenAICompatible(cfg: ProviderConfig, a: SendArgs): Promise<Raw> {
  const client = new OpenAI({
    apiKey: cfg.apiKey ?? "not-needed",
    baseURL: cfg.baseUrl,
    maxRetries: 2,
    timeout: 10 * 60 * 1000,
  });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: a.system + schemaInstruction(a.schema) },
    { role: "user", content: a.user },
  ];
  // Prefer schema-enforced output; some servers only support JSON mode or nothing.
  const formats: (OpenAI.Chat.ChatCompletionCreateParams["response_format"] | undefined)[] = [
    {
      type: "json_schema",
      json_schema: { name: `mdquiz_${a.purpose}`, schema: strictJsonSchema(a.schema), strict: cfg.info.id === "openai" },
    },
    { type: "json_object" },
    undefined,
  ];

  let completion: OpenAI.Chat.ChatCompletion | null = null;
  for (const [i, response_format] of formats.entries()) {
    try {
      completion = await client.chat.completions.create({
        model: cfg.model,
        messages,
        ...(response_format ? { response_format } : {}),
      });
      break;
    } catch (err) {
      const unsupportedFormat =
        err instanceof OpenAI.BadRequestError &&
        /response_format|json_schema|json_object|structured|schema/i.test(err.message) &&
        i < formats.length - 1;
      if (!unsupportedFormat) throw toLlmError(err, cfg);
    }
  }
  const choice = completion!.choices[0];
  if (choice?.finish_reason === "length") return { retry: "the output was cut off (too long). Keep explanations concise." };
  const text = choice?.message?.content ?? "";
  try {
    return {
      json: extractJson(text),
      inputTokens: completion!.usage?.prompt_tokens ?? 0,
      outputTokens: completion!.usage?.completion_tokens ?? 0,
      model: completion!.model || cfg.model,
    };
  } catch {
    return { retry: "the output was not valid JSON." };
  }
}

// ---------- Subscriptions through local CLIs ----------

const CLI_TIMEOUT_MS = 10 * 60 * 1000;

/** Claude Code in print mode: no tools, no session saved, schema-validated output, your Pro/Max login. */
async function sendClaudeCode(cfg: ProviderConfig, a: SendArgs): Promise<Raw> {
  const bin = findCli("claude");
  if (!bin) throw new LlmError("Le CLI Claude Code n'est pas installé.", "cli");
  const args = [
    "-p",
    "--output-format", "json",
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt", a.system,
    "--json-schema", JSON.stringify(strictJsonSchema(a.schema)),
    ...(cfg.model ? ["--model", cfg.model] : []),
  ];
  const run = await runCli(bin, args, {
    stdin: a.user,
    // Without these the CLI would bill an API key instead of the subscription.
    env: subscriptionEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]),
    // Neutral directory so no project CLAUDE.md or settings are picked up.
    cwd: os.tmpdir(),
    timeoutMs: CLI_TIMEOUT_MS,
  }).catch((err) => {
    throw new LlmError(`Impossible de lancer Claude Code : ${err.message}`, "cli");
  });
  if (run.timedOut) throw new LlmError("Claude Code a mis trop de temps à répondre (10 min). Essaie avec moins de questions.", "cli");
  try {
    const out = parseClaudeCliOutput(run.stdout);
    return { json: out.data, inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: `claude-code:${out.model ?? cfg.model}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/log ?in|\/login|not logged|authenticat|invalid api key/i.test(msg + run.stderr)) {
      throw new LlmError("Claude Code n'est pas connecté. Lance `claude` dans un terminal, connecte-toi avec ton compte Claude, puis réessaie.", "auth");
    }
    if (/usage limit|rate limit|limit reached/i.test(msg)) {
      throw new LlmError(`La limite d'utilisation de ton abonnement Claude est atteinte : ${msg}`, "rate_limit");
    }
    throw new LlmError(`Claude Code a échoué : ${msg}${run.stderr ? ` (${run.stderr.trim().slice(-200)})` : ""}`, "cli");
  }
}

/** OpenAI Codex CLI (`codex exec`) with your ChatGPT login: read-only sandbox, schema-checked final message. */
async function sendCodex(cfg: ProviderConfig, a: SendArgs): Promise<Raw> {
  const bin = findCli("codex");
  if (!bin) throw new LlmError("Le CLI Codex n'est pas installé.", "cli");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdquiz-codex-"));
  const schemaPath = path.join(dir, "schema.json");
  const outPath = path.join(dir, "out.json");
  fs.writeFileSync(schemaPath, JSON.stringify(strictJsonSchema(a.schema)));
  const prompt = `${a.system}\n\nDo not run commands or read files: answer only from the text below.\n\n${a.user}${schemaInstruction(a.schema)}`;
  try {
    const run = await runCli(
      bin,
      [
        "exec",
        "--skip-git-repo-check",
        "--sandbox", "read-only",
        "--output-schema", schemaPath,
        "--output-last-message", outPath,
        ...(cfg.model ? ["--model", cfg.model] : []),
        prompt,
      ],
      { env: subscriptionEnv(["OPENAI_API_KEY", "CODEX_API_KEY"]), cwd: dir, timeoutMs: CLI_TIMEOUT_MS },
    ).catch((err) => {
      throw new LlmError(`Impossible de lancer Codex : ${err.message}`, "cli");
    });
    if (run.timedOut) throw new LlmError("Codex a mis trop de temps à répondre (10 min). Essaie avec moins de questions.", "cli");
    const text = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : run.stdout;
    if (run.code !== 0 && !text.trim()) {
      const err = run.stderr.trim().slice(-300);
      if (/log ?in|auth/i.test(err)) {
        throw new LlmError("Codex n'est pas connecté. Lance `codex login` dans un terminal avec ton compte ChatGPT, puis réessaie.", "auth");
      }
      throw new LlmError(`Codex a échoué : ${err || `code de sortie ${run.code}`}`, "cli");
    }
    try {
      return { json: extractJson(text), inputTokens: 0, outputTokens: 0, model: `codex:${cfg.model || "default"}` };
    } catch {
      return { retry: "the output was not valid JSON." };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Errors ----------

export function toLlmError(err: unknown, cfg?: ProviderConfig): Error {
  if (err instanceof LlmError) return err;
  const name = cfg?.info.label ?? "le fournisseur du modèle";
  const status = err instanceof Anthropic.APIError || err instanceof OpenAI.APIError ? err.status : undefined;
  const isConnection = err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError;

  if (status === 401 || status === 403) {
    return new LlmError(`Ta clé ${name} a été refusée. Vérifie-la dans les Réglages.`, "auth");
  }
  if (status === 429) {
    const headers = (err as { headers?: Headers }).headers;
    const retry = headers?.get?.("retry-after");
    return new LlmError(
      `${name} : limite de requêtes atteinte, ou ton crédit est épuisé.${retry ? ` Réessaie dans environ ${retry} secondes.` : " Attends une minute et réessaie."}`,
      "rate_limit",
    );
  }
  if (status === 404) {
    return new LlmError(`Le modèle « ${cfg?.model} » est introuvable chez ${name}. Choisis-en un autre dans les Réglages.`, "bad_request");
  }
  if (status === 400 || status === 422) {
    return new LlmError(`${name} a refusé la requête : ${(err as Error).message}`, "bad_request");
  }
  if (status && status >= 500) {
    return new LlmError(`${name} est surchargé ou rencontre un problème. Réessaie dans un instant.`, "overloaded");
  }
  if (isConnection) {
    return new LlmError(
      cfg?.info.group === "local"
        ? `Impossible de joindre ${name} à ${cfg.baseUrl}. Est-il lancé ?`
        : `Impossible de joindre ${name}. Vérifie ta connexion internet.`,
      "network",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

// ---------- Settings page helpers ----------

const Ping = z.object({ ok: z.boolean() });

/** One tiny structured request, to check credentials, model and JSON support. */
export async function testProvider(cfg: ProviderConfig): Promise<{ ok: true; ms: number; model: string } | { ok: false; error: string }> {
  const problem = providerProblem(cfg);
  if (problem) return { ok: false, error: problem };
  const t0 = Date.now();
  try {
    const raw = await send(cfg, {
      schema: Ping,
      system: "You are a connectivity check.",
      user: 'Reply with {"ok": true}.',
      effort: "low",
      maxTokens: 2000,
      purpose: "grade",
    });
    if ("retry" in raw) return { ok: false, error: `Connecté, mais le modèle n'a pas renvoyé de JSON (${raw.retry})` };
    if (!Ping.safeParse(raw.json).success) return { ok: false, error: "Connecté, mais le modèle n'a pas respecté le format JSON." };
    return { ok: true, ms: Date.now() - t0, model: raw.model };
  } catch (err) {
    return { ok: false, error: toLlmError(err, cfg).message };
  }
}

/** Model ids offered by the provider (for the model picker). */
export async function listProviderModels(cfg: ProviderConfig): Promise<string[]> {
  if (cfg.info.kind === "cli") return cfg.info.modelSuggestions;
  if (cfg.info.needsKey && !cfg.apiKey) throw new LlmError(`Ajoute d'abord ta clé ${cfg.info.label}.`, "no_key");
  try {
    if (cfg.info.kind === "anthropic") {
      const ids: string[] = [];
      for await (const m of new Anthropic({ apiKey: cfg.apiKey! }).models.list()) ids.push(m.id);
      return ids;
    }
    const client = new OpenAI({ apiKey: cfg.apiKey ?? "not-needed", baseURL: cfg.baseUrl, maxRetries: 1, timeout: 20_000 });
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id.replace(/^models\//, ""));
    return ids.sort();
  } catch (err) {
    throw toLlmError(err, cfg);
  }
}
