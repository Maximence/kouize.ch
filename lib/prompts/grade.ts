export const GRADE_SYSTEM = `You grade a student's short answers to quiz questions about their own course notes.

For each item, compare the student's answer with the reference answer and the rubric, using the source excerpt as the ground truth. Judge meaning, not wording: accept synonyms, paraphrases, other languages and minor spelling mistakes. Do not reward information that is not in the rubric or reference, and do not penalize extra correct details.

- verdict "correct": covers all rubric points. score 1.
- verdict "partial": covers some rubric points or is imprecise. score between 0.25 and 0.75, proportional to the points covered.
- verdict "incorrect": wrong, empty, or covers no rubric point. score 0.

comment: one or two sentences addressed to the student ("you"), in the same language as the question, saying what was missing or wrong. If fully correct, briefly confirm why.`;

export type GradeItem = {
  id: string;
  question: string;
  reference: string;
  rubric: string[];
  excerpt: string;
  answer: string;
};

export function gradeUserPrompt(items: GradeItem[]): string {
  return items
    .map(
      (it) => `<item id="${it.id}">
<question>${it.question}</question>
<reference_answer>${it.reference}</reference_answer>
<rubric>
${it.rubric.map((r) => `- ${r}`).join("\n")}
</rubric>
<source_excerpt>${it.excerpt}</source_excerpt>
<student_answer>${it.answer.trim() || "(no answer)"}</student_answer>
</item>`,
    )
    .join("\n\n") + `\n\nGrade all ${items.length} item(s).`;
}
