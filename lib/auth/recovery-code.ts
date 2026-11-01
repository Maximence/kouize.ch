/** Accepts "kz-abcd efgh…", with or without dashes; returns the canonical "KZ-ABCD-EFGH-JKMN-PQRS" or null. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/^KZ/, "")
    // Common misreadings in Crockford base32.
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(s)) return null;
  return `KZ-${s.match(/.{4}/g)!.join("-")}`;
}
