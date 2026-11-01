import type { ProgressEvent } from "@/lib/quiz/generate";

/** POST to /api/generate and feed each NDJSON progress event to `onEvent`. */
export async function streamGeneration(body: unknown, onEvent: (e: ProgressEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    onEvent({ type: "error", message: "Impossible de joindre le serveur KOUIZE. `npm run dev` tourne-t-il toujours ?" });
    return;
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    onEvent({ type: "error", message: data.error ?? `La requête a échoué (${res.status})` });
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as ProgressEvent);
    }
  }
}
