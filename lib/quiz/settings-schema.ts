import { z } from "zod";
import { DIFFICULTIES, QUESTION_TYPES } from "./schemas";

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 50;

export const QuizSettingsInput = z.object({
  fileIds: z.array(z.string()).min(1, "Choisis au moins un fichier"),
  sectionIds: z.array(z.string()).min(1).nullable(),
  count: z.number().int().min(MIN_QUESTIONS).max(MAX_QUESTIONS),
  difficulty: z.enum([...DIFFICULTIES, "mixed"]),
  types: z.array(z.enum(QUESTION_TYPES)).min(1, "Choisis au moins un type de question"),
  language: z.enum(["auto", "fr", "en"]),
  sourceAttemptId: z.string().optional(),
});
