import { eq } from "drizzle-orm";
import { ADMIN_USER_ID } from "@/lib/auth/session";
import { viewerForAttempt } from "@/lib/auth/viewer";
import { db } from "@/lib/db";
import { attempts } from "@/lib/db/schema";
import { llmProblem, toLlmError } from "@/lib/llm";
import { ensureFeedback } from "@/lib/quiz/grading";
import { isHosted } from "@/lib/settings";

/** Generate (once) and return the written feedback for a finished attempt. */
export async function POST(_req: Request, ctx: RouteContext<"/api/attempts/[attemptId]/feedback">) {
  const { attemptId } = await ctx.params;
  const viewer = await viewerForAttempt(attemptId);
  const attempt = viewer ? db.select().from(attempts).where(eq(attempts.id, attemptId)).get() : undefined;
  if (!viewer || !attempt) return Response.json({ error: "Tentative introuvable" }, { status: 404 });
  if (!attempt.finishedAt) return Response.json({ error: "Termine d'abord la tentative" }, { status: 400 });
  if (attempt.feedback) return Response.json({ feedback: attempt.feedback });
  const userId = viewer.kind === "studio" ? viewer.userId : ADMIN_USER_ID;
  // Online, feedback is assembled from prepared tips: no AI provider involved.
  const problem = isHosted() ? null : llmProblem(userId);
  if (problem) return Response.json({ error: `Les conseils écrits nécessitent un fournisseur d'IA. ${problem}` }, { status: 400 });
  try {
    return Response.json({ feedback: await ensureFeedback(userId, attemptId) });
  } catch (err) {
    return Response.json({ error: toLlmError(err).message }, { status: 502 });
  }
}
