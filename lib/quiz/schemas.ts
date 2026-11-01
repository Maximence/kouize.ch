import { z } from "zod";
import type { Difficulty, QuestionAnswer, QuestionType } from "@/lib/db/schema";

export const QUESTION_TYPES = ["mcq", "multi", "tf", "short", "blank"] as const satisfies readonly QuestionType[];
export const DIFFICULTIES = ["easy", "medium", "hard"] as const satisfies readonly Difficulty[];

export const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Choix multiple",
  multi: "Plusieurs réponses",
  tf: "Vrai / Faux",
  short: "Réponse courte",
  blank: "Texte à trous",
};

export const DIFFICULTY_LABELS: Record<Difficulty | "mixed", string> = {
  easy: "Facile",
  medium: "Moyen",
  hard: "Difficile",
  mixed: "Mélangé",
};

export const BLANK = "____";

/**
 * What the model returns per question. Kept flat (fields unused by a type are
 * empty) because flat schemas are easier for the model to fill reliably; the
 * per-type rules are enforced afterwards by `toStoredQuestion`.
 */
export const GeneratedQuestion = z.object({
  sectionRef: z.string().describe("The id attribute of the <section> this question is based on, e.g. S3"),
  concept: z
    .string()
    .describe("The one idea this question tests, in 2–6 words (e.g. \"Nyquist sampling rate\"). Every question in the quiz needs a different concept."),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  image: z
    .string()
    .describe("If the question is about a figure of the section, or needs it to be understood, its path copied exactly from the section's image reference ![alt](path). Otherwise empty string."),
  prompt: z.string().describe(`The question. For "blank", a sentence containing exactly one ${BLANK}.`),
  options: z
    .array(z.string())
    .describe('mcq: exactly 4 options. multi: 4–6 options. tf: ["True","False"] in the quiz language. short/blank: [].'),
  correctOptions: z
    .array(z.number().int())
    .describe("0-based indexes into options. mcq/tf: exactly one. multi: one or more. short/blank: []."),
  acceptedAnswers: z
    .array(z.string())
    .describe("blank: the word(s) that fill the blank, with common variants. Otherwise []."),
  referenceAnswer: z.string().describe("short: a model answer in 1–3 sentences. Otherwise empty string."),
  rubric: z.array(z.string()).describe("short: 2–4 key points a full-credit answer must contain. Otherwise []."),
  explanation: z.string().describe("Why the answer is correct, in 1–3 sentences, based only on the section."),
  excerpt: z
    .string()
    .describe("A short verbatim quote (one or two sentences) copied from the section that justifies the answer."),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

export const GenerationOutput = z.object({
  title: z.string().describe("A short quiz title (max 8 words) in the quiz language."),
  questions: z.array(GeneratedQuestion),
});
export type GenerationOutput = z.infer<typeof GenerationOutput>;

export type StoredQuestionFields = {
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  answer: QuestionAnswer;
  explanation: string;
  excerpt: string;
};

/** Validate per-type rules and convert to the DB shape. Returns an error string if invalid. */
export function toStoredQuestion(q: GeneratedQuestion): StoredQuestionFields | string {
  const base = {
    type: q.type,
    difficulty: q.difficulty,
    prompt: q.prompt.trim(),
    explanation: q.explanation.trim(),
    excerpt: q.excerpt.trim(),
  };
  if (!base.prompt) return "empty prompt";
  const options = q.options.map((o) => o.trim());
  const uniqueCorrect = [...new Set(q.correctOptions)].sort((a, b) => a - b);
  const inRange = uniqueCorrect.every((i) => i >= 0 && i < options.length);

  switch (q.type) {
    case "mcq":
      if (options.length !== 4 || new Set(options).size !== 4) return "mcq needs 4 distinct options";
      if (uniqueCorrect.length !== 1 || !inRange) return "mcq needs exactly one correct option";
      return { ...base, options, answer: { type: "mcq", correct: uniqueCorrect[0] } };
    case "multi":
      if (options.length < 3 || options.length > 6 || new Set(options).size !== options.length)
        return "multi needs 3–6 distinct options";
      if (!uniqueCorrect.length || !inRange) return "multi needs at least one correct option";
      return { ...base, options, answer: { type: "multi", correct: uniqueCorrect } };
    case "tf":
      if (options.length !== 2 || uniqueCorrect.length !== 1 || !inRange) return "tf needs 2 options, one correct";
      // Index 0 is "True" by convention of the prompt.
      return { ...base, options, answer: { type: "tf", correct: uniqueCorrect[0] === 0 } };
    case "short":
      if (!q.referenceAnswer.trim() || !q.rubric.length) return "short needs a reference answer and rubric";
      return {
        ...base,
        options: [],
        answer: { type: "short", reference: q.referenceAnswer.trim(), rubric: q.rubric.map((r) => r.trim()) },
      };
    case "blank": {
      const accepted = q.acceptedAnswers.map((a) => a.trim()).filter(Boolean);
      if (!base.prompt.includes(BLANK)) return `blank prompt must contain ${BLANK}`;
      if (!accepted.length) return "blank needs accepted answers";
      return { ...base, options: [], answer: { type: "blank", accepted } };
    }
  }
}

// ---------- Grading & feedback ----------

export const GradeOutput = z.object({
  grades: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["correct", "partial", "incorrect"]),
      score: z.number().min(0).max(1).describe("0 to 1"),
      comment: z.string().describe("One or two sentences: what was right and what was missing."),
    }),
  ),
});
export type GradeOutput = z.infer<typeof GradeOutput>;

export const FeedbackOutput = z.object({
  feedback: z.string().describe("Markdown, at most 150 words."),
});

// ---------- Preparing a quiz for the online copy (no AI there) ----------

export const PrepareOutput = z.object({
  shortAnswers: z.array(
    z.object({
      id: z.string(),
      keyPoints: z
        .array(
          z.object({
            point: z.string().describe("One idea a full-credit answer must contain, in a few words."),
            keywords: z
              .array(z.string())
              .describe("3–8 words or short phrases a student would write to express this idea: synonyms, abbreviations, symbols, both singular and plural if they differ a lot."),
          }),
        )
        .describe("2–5 key points, one per rubric point."),
    }),
  ),
  tips: z.array(
    z.object({
      section: z.string().describe("The section path, copied exactly."),
      tip: z.string().describe("One or two sentences: what to re-read or practise in this section."),
    }),
  ),
});
export type PrepareOutput = z.infer<typeof PrepareOutput>;
