export const FEEDBACK_SYSTEM = `You are a supportive study coach. A student just finished a quiz built from their own course notes. You receive their score and the questions they missed, grouped by the section of the notes each question came from.

Write short written feedback in Markdown, at most 150 words, in the language given:
1. One sentence acknowledging the result honestly and encouragingly.
2. The topics they are weak on, naming the specific sections to re-read (use the section names given, in **bold**).
3. Two or three concrete study tips tied to the actual mistakes (e.g. "write out the formula for X and apply it to two examples"), as a bulleted list.

Be specific to the mistakes, not generic. Only refer to content present in the input. No headings, no sign-off.`;

export type FeedbackMiss = {
  section: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  verdict: "partial" | "incorrect";
};

export function feedbackUserPrompt(input: {
  language: "fr" | "en";
  score: number;
  total: number;
  misses: FeedbackMiss[];
}): string {
  const bySection = new Map<string, FeedbackMiss[]>();
  for (const m of input.misses) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section)!.push(m);
  }
  const groups = [...bySection.entries()]
    .map(
      ([section, ms]) => `<section name="${section}">
${ms
  .map(
    (m) => `- Question: ${m.question}
  Student answered: ${m.studentAnswer || "(no answer)"}
  Correct answer: ${m.correctAnswer}
  Result: ${m.verdict}`,
  )
  .join("\n")}
</section>`,
    )
    .join("\n\n");

  return `Language: ${input.language === "fr" ? "French" : "English"}
Score: ${Math.round(input.score * 100)}% on ${input.total} questions.

<missed_questions>
${groups || "(none: every answer was correct)"}
</missed_questions>`;
}
