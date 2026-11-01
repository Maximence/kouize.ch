import { z } from "zod";
import { QuizExport } from "@/lib/quiz/portable";

// What the studio sends to the online copy's /api/publish endpoints.

export const PublishRequest = z.object({
  classCode: z.string().min(1).max(40),
  /** The studio's quiz id: publishing again updates the same online quiz. */
  sourceId: z.string().min(1).max(64),
  quiz: QuizExport,
  /** The studio subject, to group quizzes inside the class. */
  subject: z
    .object({ name: z.string().min(1).max(80), emoji: z.string().max(16), color: z.string().max(16) })
    .optional(),
});
export type PublishRequest = z.infer<typeof PublishRequest>;

export const UnpublishRequest = z.object({
  classCode: z.string().min(1).max(40),
  sourceId: z.string().min(1).max(64),
});

export type RemoteClass = {
  code: string;
  name: string;
  quizzes: { id: string; sourceId: string | null; title: string; hidden: boolean }[];
};
export type PublishResponse = { quizId: string; url: string; created: boolean };
