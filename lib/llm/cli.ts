import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CliName = "claude" | "codex";

/** Look for a CLI on PATH and in the usual install locations (the dev server's PATH can be minimal). */
export function findCli(name: CliName): string | null {
  const home = os.homedir();
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".volta", "bin"),
  ];
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/**
 * Environment for a subscription CLI: drop API keys so the CLI uses the
 * account it is logged into instead of billing an API key.
 */
export function subscriptionEnv(drop: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of drop) delete env[k];
  return env;
}

export type CliRun = { stdout: string; stderr: string; code: number | null; timedOut: boolean };

/** Run a CLI without a shell: arguments are passed as-is, the prompt goes through stdin. */
export function runCli(
  bin: string,
  args: string[],
  opts: { stdin?: string; env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number },
): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
    child.stdin.on("error", () => {
      // The CLI may exit before reading stdin; the close handler reports it.
    });
    child.stdin.end(opts.stdin ?? "");
  });
}

export type ParsedCli = { data: unknown; inputTokens: number; outputTokens: number; model: string | null };

/** Parse `claude -p --output-format json` output. Throws a readable Error on failure. */
export function parseClaudeCliOutput(stdout: string): ParsedCli {
  let out: {
    is_error?: boolean;
    result?: string;
    structured_output?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    modelUsage?: Record<string, unknown>;
  };
  try {
    // Some versions print warnings before the JSON; take the last JSON object line.
    const line = stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{")) ?? stdout;
    out = JSON.parse(line);
  } catch {
    throw new Error(`Unexpected output from Claude Code: ${stdout.slice(0, 200) || "(empty)"}`);
  }
  if (out.is_error) throw new Error(out.result || "Claude Code a signalé une erreur.");
  let data = out.structured_output;
  if (data === undefined && typeof out.result === "string") data = extractJson(out.result);
  const u = out.usage ?? {};
  return {
    data,
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    model: out.modelUsage ? (Object.keys(out.modelUsage)[0] ?? null) : null,
  };
}

/** Pull a JSON object out of free text (fenced block or first {...} span). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("La réponse du modèle ne contenait pas de JSON.");
  }
}
