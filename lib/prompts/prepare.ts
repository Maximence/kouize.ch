export const PREPARE_SYSTEM = `You prepare a quiz built from a student's course notes so it can be used on a website that has no AI.

1. Short-answer questions will be graded by keyword matching. For each one, turn the rubric into 2–5 key points. For each key point, list 3–8 keywords or short phrases (1–3 words each) that a student who knows the idea would very likely write: the exact technical term, common synonyms, abbreviations, symbols or formulas, and the word in the other language (French/English) when students often mix them. Avoid generic words that a wrong answer would also contain (e.g. "the", "signal", "value" alone). Keywords are matched ignoring case, accents and word endings.

2. For each section of the notes, write one study tip: one or two sentences, in the quiz language, telling a student who missed questions on this section what to re-read or practise. Be specific to the section's content. Only use content present in the input.`;

export type PrepareShortItem = { id: string; question: string; reference: string; rubric: string[]; excerpt: string };
export type PrepareSection = { path: string; content: string };

export function prepareUserPrompt(input: {
  language: "fr" | "en";
  short: PrepareShortItem[];
  sections: PrepareSection[];
}): string {
  const short = input.short
    .map(
      (it) => `<question id="${it.id}">
<prompt>${it.question}</prompt>
<reference_answer>${it.reference}</reference_answer>
<rubric>
${it.rubric.map((r) => `- ${r}`).join("\n")}
</rubric>
<source_excerpt>${it.excerpt}</source_excerpt>
</question>`,
    )
    .join("\n\n");
  const sections = input.sections
    .map((s) => `<section path="${s.path.replace(/"/g, "'")}">\n${s.content}\n</section>`)
    .join("\n\n");
  return `Quiz language: ${input.language === "fr" ? "French" : "English"}

<short_answer_questions>
${short || "(none)"}
</short_answer_questions>

<sections>
${sections || "(none)"}
</sections>

Return key points for all ${input.short.length} short-answer question(s) and one tip for each of the ${input.sections.length} section(s).`;
}
