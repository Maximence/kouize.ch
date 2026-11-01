// Shared by server and client (settings form, cost estimate).
import { DEFAULT_PROVIDER, type ProviderId } from "@/lib/llm/providers";

export type Effort = "low" | "medium" | "high";

export type AppSettings = {
  provider: ProviderId;
  /** Effort only applies to providers that support it (Anthropic API). */
  effortGenerate: Effort;
  effortGrade: Effort;
};

export const DEFAULT_SETTINGS: AppSettings = {
  provider: DEFAULT_PROVIDER,
  effortGenerate: "medium",
  effortGrade: "low",
};

/** USD per million tokens, for the pre-generation estimate. Only prices we know for sure. */
const PRICES: Record<string, { input: number; output: number }> = {
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic:claude-opus-5-5": { input: 4, output: 20 },
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function priceFor(provider: string, model: string) {
  return PRICES[`${provider}:${model}`] ?? null;
}

/** Rough token estimate (no API call): ~3.5 chars per token for prose, a bit less for FR/code. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.5);
}

/** Output tokens per question including reasoning overhead. */
export const OUTPUT_TOKENS_PER_QUESTION = 450;
export const SYSTEM_PROMPT_TOKENS = 900;
