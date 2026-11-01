// Provider catalog, shared by the server and the settings UI. No secrets here.

export type ProviderKind = "anthropic" | "openai-compatible" | "cli";

export type ProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom"
  | "claude-code"
  | "codex";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  group: "subscription" | "api" | "local";
  description: string;
  needsKey: boolean;
  /** Env var read when no key was entered in Settings. */
  envKey?: string;
  defaultBaseUrl?: string;
  baseUrlEditable?: boolean;
  defaultModel: string;
  modelSuggestions: string[];
  keyUrl?: string;
  /** Not run on the author's machine; the Test button tells the user if it works. */
  experimental?: boolean;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude-code",
    label: "Claude (abonnement Pro/Max)",
    kind: "cli",
    group: "subscription",
    description:
      "Utilise le CLI Claude Code sur lequel tu es connecté. Pas de clé API ; les requêtes comptent dans les limites de ton abonnement.",
    needsKey: false,
    defaultModel: "sonnet",
    modelSuggestions: ["sonnet", "opus", "haiku"],
  },
  {
    id: "codex",
    label: "ChatGPT (abonnement Plus/Pro)",
    kind: "cli",
    group: "subscription",
    description:
      "Utilise le CLI OpenAI Codex (`codex login` avec ton compte ChatGPT). Les requêtes comptent dans les limites de ton abonnement.",
    needsKey: false,
    defaultModel: "",
    modelSuggestions: [],
    experimental: true,
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    kind: "anthropic",
    group: "api",
    description: "Modèles Claude, paiement à l'usage.",
    needsKey: true,
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5-5",
    modelSuggestions: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI API",
    kind: "openai-compatible",
    group: "api",
    description: "Modèles GPT, paiement à l'usage.",
    needsKey: true,
    envKey: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "",
    modelSuggestions: [],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    label: "Google Gemini API",
    kind: "openai-compatible",
    group: "api",
    description: "Modèles Gemini via Google AI Studio. Offre gratuite disponible.",
    needsKey: true,
    envKey: "GEMINI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "",
    modelSuggestions: [],
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    group: "api",
    description: "Une seule clé pour des centaines de modèles (Mistral, Llama, DeepSeek, Qwen…).",
    needsKey: true,
    envKey: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    modelSuggestions: [],
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai-compatible",
    group: "local",
    description: "Gratuit, les modèles tournent sur ton ordinateur. Lance Ollama et télécharge un modèle d'abord.",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434/v1",
    baseUrlEditable: true,
    defaultModel: "",
    modelSuggestions: [],
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "openai-compatible",
    group: "local",
    description: "Gratuit, les modèles tournent sur ton ordinateur. Lance d'abord le serveur local de LM Studio.",
    needsKey: false,
    defaultBaseUrl: "http://localhost:1234/v1",
    baseUrlEditable: true,
    defaultModel: "",
    modelSuggestions: [],
  },
  {
    id: "custom",
    label: "Autre API compatible OpenAI",
    kind: "openai-compatible",
    group: "api",
    description: "Mistral, Groq, DeepSeek, Together, un vLLM auto-hébergé… tout ce qui a un point d'accès /v1 de style OpenAI.",
    needsKey: false,
    defaultBaseUrl: "",
    baseUrlEditable: true,
    defaultModel: "",
    modelSuggestions: [],
  },
];

export const DEFAULT_PROVIDER: ProviderId = "anthropic";

/**
 * On a hosted copy (KOUIZE_HOSTED=1) the subscription CLIs are hidden: they
 * would run everyone's requests on the server owner's personal account.
 */
export function availableProviders(hosted: boolean): ProviderInfo[] {
  return hosted ? PROVIDERS.filter((p) => p.kind !== "cli") : PROVIDERS;
}

export function providerInfo(id: string): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER)!;
}

export const GROUP_LABELS: Record<ProviderInfo["group"], string> = {
  subscription: "Utiliser un abonnement que tu paies déjà",
  api: "Clé API",
  local: "Modèle local (gratuit, hors ligne)",
};
