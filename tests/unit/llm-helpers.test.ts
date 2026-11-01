import { describe, expect, it } from "vitest";
import { extractJson, parseClaudeCliOutput } from "@/lib/llm/cli";
import { strictJsonSchema } from "@/lib/llm/json-schema";
import { PROVIDERS, providerInfo } from "@/lib/llm/providers";
import { priceFor } from "@/lib/models";
import { GenerationOutput, GradeOutput } from "@/lib/quiz/schemas";

// Loose view of a JSON Schema for assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = Record<string, any>;

describe("strictJsonSchema", () => {
  it("closes every object, requires every property and drops unsupported keywords", () => {
    const s = strictJsonSchema(GradeOutput) as Schema;
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBe(false);
    const item = s.properties.grades.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["id", "verdict", "score", "comment"]);
    expect(item.properties.score.minimum).toBeUndefined();
    expect(item.properties.score.maximum).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/minimum|maximum|minLength/);
  });

  it("keeps enums and descriptions for the generation schema", () => {
    const s = strictJsonSchema(GenerationOutput) as Schema;
    const q = s.properties.questions.items;
    expect(q.properties.type.enum).toEqual(["mcq", "multi", "tf", "short", "blank"]);
    expect(q.properties.excerpt.description).toMatch(/verbatim/);
  });
});

describe("Claude Code output", () => {
  it("prefers structured_output and sums cached input tokens", () => {
    const out = parseClaudeCliOutput(
      JSON.stringify({
        type: "result",
        is_error: false,
        result: '{"ok":true}',
        structured_output: { ok: true },
        usage: { input_tokens: 2, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: 5 },
        modelUsage: { "claude-sonnet-5-5": {} },
      }),
    );
    expect(out).toEqual({ data: { ok: true }, inputTokens: 112, outputTokens: 5, model: "claude-sonnet-5-5" });
  });

  it("falls back to parsing result and ignores leading warning lines", () => {
    const out = parseClaudeCliOutput('warning: something\n{"is_error":false,"result":"```json\\n{\\"ok\\":true}\\n```"}');
    expect(out.data).toEqual({ ok: true });
  });

  it("throws the CLI's error message", () => {
    expect(() => parseClaudeCliOutput('{"is_error":true,"result":"Not logged in · Please run /login"}')).toThrow(/login/);
    expect(() => parseClaudeCliOutput("")).toThrow(/Unexpected output/);
  });
});

describe("extractJson", () => {
  it("handles plain JSON, fenced blocks and surrounding prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} Hope it helps.')).toEqual({ a: 3 });
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("provider catalog", () => {
  it("has unique ids and falls back to the default for unknown ids", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    expect(providerInfo("nope").id).toBe("anthropic");
    expect(providerInfo("ollama").defaultBaseUrl).toBe("http://localhost:11434/v1");
  });

  it("only prices models it knows", () => {
    expect(priceFor("anthropic", "claude-sonnet-5-5")).toEqual({ input: 2, output: 10 });
    expect(priceFor("openai", "anything")).toBeNull();
  });
});
