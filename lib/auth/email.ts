// Plain helpers, shared by the account and invitation code (and unit tests).

/** Trimmed and lowercased: emails are compared and stored this way. */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Deliberately loose: the real check is whether mail arrives. */
export function isEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Where to go after logging in: only paths on this site ("/k/m55"), never "//evil.example". */
export function safeNext(raw: unknown, fallback = "/"): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

export const MIN_PASSWORD = 8;
