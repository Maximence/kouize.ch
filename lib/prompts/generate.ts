import type { Difficulty, QuestionType } from "@/lib/db/schema";
import { BLANK, TYPE_LABELS } from "@/lib/quiz/schemas";

// Frozen so it can be prompt-cached: anything per-request goes in the user message.
export const GENERATE_SYSTEM = `You write study quiz questions from a student's course notes.

Grounding rules (most important):
- Every question must be answerable using ONLY the text of the <section> it cites. Do not use outside knowledge, even if it is true. If the notes don't state something, don't ask about it.
- "excerpt" must be copied verbatim from that section (one or two sentences, no paraphrasing, no ellipses), and must justify the correct answer. Copy math exactly as written, including $ delimiters.
- "explanation" explains the answer using the section's content.

Question quality:
- Test understanding of important ideas (definitions, relationships, causes, comparisons, formulas, procedures), not trivia such as heading names or the order of paragraphs.
- Each question must be self-contained and unambiguous; never refer to "the section", "the notes" or "the text".
- One concept per question: every question must test a different idea. Never write two questions about the same concept, fact, definition or formula, even with different wording or question types, and never reuse a concept listed in <existing_questions>. If a section doesn't hold enough distinct ideas for its requested count, write fewer questions for it rather than repeating one.
- Name that idea in "concept" (2–6 words).
- Write in the requested quiz language, even if a section uses another language. Keep technical terms, code and formulas as they appear in the notes.
- Use Markdown for code (\`inline\` or fenced blocks) and LaTeX in $...$ for math in prompts, options and explanations.

Figures:
- Sections may contain images as ![alt](path). You can't see the picture itself, only its alt text and the text around it.
- When a question is about what the notes say of a figure, or the figure helps to understand the question, put its path in "image": it is shown above the question. Ask only what the text and alt text support, and never give the answer away in the alt text you rely on.
- Otherwise leave "image" empty.

Per type:
- mcq: exactly 4 options, exactly one correct. Distractors must be plausible to a student who skimmed the notes: same category and similar length as the correct answer, built from related concepts in the notes or common misconceptions. Avoid "all of the above" / "none of the above". Vary the position of the correct option.
- multi ("select all that apply"): 4–6 options with at least 2 correct and at least 1 incorrect. Say "select all that apply" in the prompt, in the quiz language (e.g. "plusieurs réponses possibles" in French).
- tf: options are exactly ["True","False"] translated into the quiz language, True first. Make false statements by changing one meaningful detail, not by negating with "not".
- short: an open question answerable in 1–3 sentences. Give a referenceAnswer and a rubric of 2–4 key points.
- blank: a sentence from the notes' ideas with one key term replaced by ${BLANK}. acceptedAnswers lists the term and close variants (singular/plural, with/without accents, abbreviation).

Difficulty:
- easy: recall of a single fact or definition stated directly.
- medium: understanding — explain, compare, or apply one idea to a simple case.
- hard: combine two ideas, apply a formula to new numbers, or spot a subtle distinction.`;

export type GenerateBatchInput = {
  language: "fr" | "en";
  parts: { ref: string; headingPath: string; content: string; count: number }[];
  types: Partial<Record<QuestionType, number>>;
  difficulties: Partial<Record<Difficulty, number>>;
  existing: { concept: string; prompt: string }[];
};

const LANGUAGE_NAME = { fr: "French", en: "English" } as const;

export function generateUserPrompt(input: GenerateBatchInput): string {
  const total = input.parts.reduce((a, p) => a + p.count, 0);
  const sections = input.parts
    .map((p) => `<section id="${p.ref}" path="${escapeAttr(p.headingPath)}" questions="${p.count}">\n${p.content}\n</section>`)
    .join("\n\n");
  const typeLines = Object.entries(input.types)
    .map(([t, n]) => `- ${n} × ${t} (${TYPE_LABELS[t as QuestionType]})`)
    .join("\n");
  const diffLines = Object.entries(input.difficulties)
    .map(([d, n]) => `- ${n} × ${d}`)
    .join("\n");
  const existing = input.existing.length
    ? input.existing.map((q) => `- [${q.concept}] ${q.prompt}`).join("\n")
    : "(none)";

  return `<notes>
${sections}
</notes>

<existing_questions>
${existing}
</existing_questions>

Write exactly ${total} questions in ${LANGUAGE_NAME[input.language]}.
Questions per section: as given by each section's "questions" attribute.
Question types:
${typeLines}
Difficulty:
${diffLines}
Spread the types and difficulties sensibly across the sections. Also propose a short title for the quiz.`;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
