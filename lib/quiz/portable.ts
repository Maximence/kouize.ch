import { z } from "zod";
import type { questions, quizzes } from "@/lib/db/schema";
import { correctAnswerText } from "./answer-text";
import { DIFFICULTIES, DIFFICULTY_LABELS, QUESTION_TYPES, TYPE_LABELS } from "./schemas";

type Quiz = typeof quizzes.$inferSelect;
type Question = typeof questions.$inferSelect;

export const EXPORT_FORMAT = "mdquiz-quiz";

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mcq"), correct: z.number().int().min(0) }),
  z.object({ type: z.literal("multi"), correct: z.array(z.number().int().min(0)).min(1) }),
  z.object({ type: z.literal("tf"), correct: z.boolean() }),
  z.object({
    type: z.literal("short"),
    reference: z.string(),
    rubric: z.array(z.string()),
    keyPoints: z
      .array(z.object({ point: z.string().min(1).max(300), keywords: z.array(z.string().min(1).max(80)).min(1).max(12) }))
      .max(8)
      .optional(),
  }),
  z.object({ type: z.literal("blank"), accepted: z.array(z.string()).min(1) }),
]);

export const QuizExport = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  quiz: z.object({
    title: z.string().min(1),
    language: z.enum(["fr", "en"]).catch("en"),
    /** Prepared before publishing: a study tip per section path, used for online feedback. */
    studyTips: z.record(z.string().max(300), z.string().max(1000)).optional(),
  }),
  questions: z
    .array(
      z.object({
        type: z.enum(QUESTION_TYPES),
        difficulty: z.enum(DIFFICULTIES).catch("medium"),
        prompt: z.string().min(1),
        options: z.array(z.string()),
        answer: AnswerSchema,
        explanation: z.string().default(""),
        excerpt: z.string().default(""),
        sectionPath: z.string().default(""),
        /** A figure shown with the question; its bytes are in `images`. */
        image: z.object({ id: z.string().regex(/^[0-9a-f]{64}$/), alt: z.string().max(500) }).optional(),
      }),
    )
    .min(1, "Le fichier ne contient aucune question"),
  /** Figures used by the questions: SHA-256 id → base64 bytes. */
  images: z
    .record(z.string().regex(/^[0-9a-f]{64}$/), z.object({ mime: z.string().max(40), data: z.string() }))
    .optional(),
});
export type QuizExport = z.infer<typeof QuizExport>;

export function toExportJson(quiz: Quiz, qs: Question[]): QuizExport {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    quiz: { title: quiz.title, language: quiz.language === "fr" ? "fr" : "en" },
    questions: qs.map((q) => ({
      type: q.type,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      excerpt: q.excerpt,
      sectionPath: q.sectionPath,
      ...(q.imageId ? { image: { id: q.imageId, alt: q.imageAlt ?? "" } } : {}),
    })),
  };
}

/** A readable Markdown version: questions first, answer key at the end. */
export function toMarkdown(quiz: Quiz, qs: Question[]): string {
  const tf = quiz.language === "fr" ? ["Vrai", "Faux"] : ["True", "False"];
  const letters = "ABCDEFGH";
  const body = qs
    .map((q, i) => {
      const opts = q.options.length && q.type !== "tf"
        ? "\n\n" + q.options.map((o, k) => `   ${letters[k]}. ${o}`).join("\n")
        : q.type === "tf" ? `\n\n   ${tf[0]} / ${tf[1]}` : "";
      return `${i + 1}. *(${TYPE_LABELS[q.type]}, ${DIFFICULTY_LABELS[q.difficulty].toLowerCase()})* ${q.prompt}${opts}`;
    })
    .join("\n\n");
  const key = qs
    .map((q, i) => {
      const a = q.answer;
      const letter =
        a.type === "mcq" ? `${letters[a.correct]}. ` : a.type === "multi" ? `${a.correct.map((k) => letters[k]).join(", ")}: ` : "";
      return `${i + 1}. **${letter}${correctAnswerText(q, tf)}**${q.explanation ? ` ${q.explanation}` : ""}${q.sectionPath ? ` *(${q.sectionPath})*` : ""}`;
    })
    .join("\n");
  return `# ${quiz.title}\n\n${body}\n\n---\n\n## Corrigé\n\n${key}\n`;
}
