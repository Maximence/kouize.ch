import { and, asc, eq, isNull } from "drizzle-orm";
import { ownsQuiz } from "@/lib/auth/ownership";
import { studioUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { questions, quizzes } from "@/lib/db/schema";
import { exportImages } from "@/lib/images";
import { toExportJson, toMarkdown } from "@/lib/quiz/portable";

export async function GET(req: Request, ctx: RouteContext<"/api/quizzes/[quizId]/export">) {
  const { quizId } = await ctx.params;
  const userId = await studioUserId();
  if (!userId) return Response.json({ error: "Introuvable" }, { status: 404 });
  const user = { id: userId };
  const quiz = ownsQuiz(user.id, quizId) ? db.select().from(quizzes).where(eq(quizzes.id, quizId)).get() : undefined;
  if (!quiz) return Response.json({ error: "Quiz introuvable" }, { status: 404 });
  const qs = db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.deletedAt)))
    .orderBy(asc(questions.ord))
    .all();

  const format = new URL(req.url).searchParams.get("format") === "md" ? "md" : "json";
  const base = quiz.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
  const body = format === "md" ? toMarkdown(quiz, qs) : JSON.stringify({ ...toExportJson(quiz, qs), images: exportImages(qs.map((q) => q.imageId)) }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.${format}`)}`,
    },
  });
}
