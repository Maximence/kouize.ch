// What a notes file may be. Plain module: shared with the unit tests.

export const MAX_NOTE_BYTES = 15 * 1024 * 1024;
export const MAX_NOTES_PER_UPLOAD = 5;
export const NOTE_MIMES = ["application/pdf", "text/plain", "text/markdown"] as const;
export type NoteMime = (typeof NOTE_MIMES)[number];

/** The note's type from its name and bytes, so a renamed file can't pass as a PDF. Null when not accepted. */
export function sniffNote(data: Buffer, fileName: string): NoteMime | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return data.subarray(0, 5).toString("latin1") === "%PDF-" ? "application/pdf" : null;
  if (ext !== "txt" && ext !== "md" && ext !== "markdown") return null;
  // Text must really be text: valid UTF-8, no NUL bytes.
  if (data.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
  return ext === "txt" ? "text/plain" : "text/markdown";
}
