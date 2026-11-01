// Image references in notes. Pure: shared by the parser, the renderer and the server.

/** "./figures/Fig 1.PNG?raw" → "fig 1.png": images are matched by file name only. */
export function imageName(src: string): string {
  let s = src.split(/[?#]/)[0];
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep as is
  }
  return (s.split(/[\\/]/).pop() ?? s).trim().toLowerCase();
}

export const isRemoteImage = (src: string) => /^(https?:|data:)/i.test(src);

/** Markdown and HTML image references in a piece of notes, in order. */
export function imageRefs(markdown: string): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  const md = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const m of markdown.matchAll(md)) out.push({ alt: m[1].trim(), src: m[2] });
  const html = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const m of markdown.matchAll(html)) {
    const alt = /\balt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
    out.push({ alt: alt.trim(), src: m[1] });
  }
  return out;
}
