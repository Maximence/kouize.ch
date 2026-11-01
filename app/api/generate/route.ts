import { eq } from "drizzle-orm";
import { z } from "zod";
import { ownsCategory, ownsQuiz } from "@/lib/auth/ownership";
import { studioUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { llmProblem } from "@/lib/llm";
import { generateQuiz } from "@/lib/quiz/generate";
import { QuizSettingsInput } from "@/lib/quiz/settings-schema";

const Body = z.union([
  z.object({ categoryId: z.string(), settings: QuizSettingsInput }),
  // "Regenerate": same settings as an existing quiz, fresh API call.
  z.object({ regenerateQuizId: z.string() }),
]);

/** Streams generation progress as newline-delimited JSON. */
export async function POST(req: Request) {
  const userId = await studioUserId();
  if (!userId) return Response.json({ error: "Introuvable" }, { status: 404 });
  const user = { id: userId };
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const problem = llmProblem(user.id);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  let categoryId: string;
  let settings: z.infer<typeof QuizSettingsInput>;
  let bypassCache = false;
  if ("regenerateQuizId" in parsed.data) {
    const quiz = ownsQuiz(user.id, parsed.data.regenerateQuizId)
      ? db.select().from(quizzes).where(eq(quizzes.id, parsed.data.regenerateQuizId)).get()
      : undefined;
    if (!quiz) return Response.json({ error: "Quiz introuvable" }, { status: 404 });
    categoryId = quiz.categoryId;
    settings = { ...quiz.settings };
    bypassCache = true;
  } else {
    categoryId = parsed.data.categoryId;
    settings = parsed.data.settings;
    if (!ownsCategory(user.id, categoryId)) {
      return Response.json({ error: "Matière introuvable" }, { status: 404 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generateQuiz(user.id, categoryId, settings, { bypassCache })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error";
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
