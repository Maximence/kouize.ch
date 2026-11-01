"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { currentPlayer } from "@/lib/auth/player";
import { rateLimiter } from "@/lib/auth/rate-limit";
import { currentUser, isAdmin } from "@/lib/auth/session";
import { playableQuiz } from "@/lib/auth/viewer";
import { ownedClass } from "@/lib/classes";
import { db } from "@/lib/db";
import { questions, quizzes, suggestions } from "@/lib/db/schema";
import { setSuggestionStatus } from "@/lib/suggestions";
import { fail, ok, type ActionResult } from "./result";

const SuggestionInput = z.object({
  questionId: z.string().min(1).max(40),
  kind: z.enum(["wrong-answer", "unclear", "typo", "other"]),
  message: z.string().trim().min(3, "Dis en quelques mots ce qui devrait changer").max(1000, "Reste sous les 1000 caractères"),
});

// Enough for honest use, not for flooding your inbox.
const perPlayer = rateLimiter(20, 60 * 60 * 1000);

/** A student suggests a change to a question of a quiz they can play. */
export async function suggestFix(input: z.input<typeof SuggestionInput>): Promise<ActionResult> {
  const parsed = SuggestionInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const player = await currentPlayer();
  if (!player) return fail("Connecte-toi d'abord");
  const q = db.select({ quizId: questions.quizId }).from(questions).where(eq(questions.id, parsed.data.questionId)).get();
  if (!q || !playableQuiz(player.id, q.quizId)) return fail("Question introuvable");
  if (!perPlayer.take(player.id)) return fail("Ça fait beaucoup de suggestions ! Réessaie dans une heure.");
  db.insert(suggestions)
    .values({ ...parsed.data, quizId: q.quizId, playerId: player.id })
    .run();
  return ok();
}

/** Admin, or the student who owns the class: mark a suggestion as done, dismissed, or open again. */
export async function updateSuggestion(id: string, status: "open" | "done" | "dismissed"): Promise<ActionResult> {
  if (!(await isAdmin())) {
    const user = await currentUser();
    const row = db
      .select({ classId: quizzes.classId })
      .from(suggestions)
      .innerJoin(quizzes, eq(quizzes.id, suggestions.quizId))
      .where(eq(suggestions.id, id))
      .get();
    if (!user || !row?.classId || !ownedClass(user.id, row.classId)) return fail("Suggestion introuvable");
  }
  setSuggestionStatus([id], status);
  refresh();
  return ok();
}
