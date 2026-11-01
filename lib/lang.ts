const FR = new Set(
  "le la les des une est et du dans pour que qui pas sur avec par sont ce cette ces au aux ou mais nous vous leur être fait comme plus donc ainsi lorsque".split(" "),
);
const EN = new Set(
  "the a an is are and of to in for that which not on with by this these it or but we you their be as more so when from".split(" "),
);

/** Cheap FR/EN guess from stop-word frequency and accented letters. */
export function detectLanguage(text: string): "fr" | "en" {
  const sample = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, " ")
    .slice(0, 20_000)
    .toLowerCase();
  const words = sample.match(/\p{L}+/gu) ?? [];
  let fr = 0;
  let en = 0;
  for (const w of words) {
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
  }
  fr += (sample.match(/[éèêàçùâîôû]/g) ?? []).length * 0.3;
  return fr > en ? "fr" : "en";
}
