"use server";

import { z } from "zod";
import { ownsQuestion } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { recordReview } from "@/lib/srs/store";
import { fail, ok, type ActionResult } from "./result";

const Verdict = z.enum(["correct", "partial", "incorrect"]);

/** Record a review-queue or flashcard answer in the Leitner schedule. */
export async function recordStudyAnswer(questionId: string, verdict: z.infer<typeof Verdict>): Promise<ActionResult> {
  const v = Verdict.safeParse(verdict);
  if (!v.success) return fail("Verdict invalide");
  if (!ownsQuestion(await requireUserId(), questionId)) return fail("Question introuvable");
  recordReview(questionId, v.data);
  return ok();
}
