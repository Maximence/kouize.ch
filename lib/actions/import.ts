"use server";

import { refresh } from "next/cache";
import { ownsCategory } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { importImages } from "@/lib/images";
import { questions, quizzes } from "@/lib/db/schema";
import { QuizExport } from "@/lib/quiz/portable";
import { fail, ok, type ActionResult } from "./result";

/** Import a quiz exported as JSON. Imported questions have no link to a note section. */
export async function importQuiz(categoryId: string, text: string): Promise<ActionResult<{ quizId: string }>> {
  if (!ownsCategory(await requireUserId(), categoryId)) return fail("Matière introuvable");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("Ce fichier n'est pas du JSON valide");
  }
  const parsed = QuizExport.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`Ce n'est pas un export KOUIZE : ${issue.path.join(".") || "fichier"} ${issue.message}`);
  }
  const data = parsed.data;
  const known = importImages(data.images);
  const quiz = db.transaction((tx) => {
    const q = tx
      .insert(quizzes)
      .values({
        categoryId,
        title: data.quiz.title,
        language: data.quiz.language,
        status: "ready",
        settings: {
          fileIds: [],
          sectionIds: null,
          count: data.questions.length,
          difficulty: "mixed",
          types: [...new Set(data.questions.map((x) => x.type))],
          language: data.quiz.language,
        },
      })
      .returning()
      .get();
    tx.insert(questions)
      .values(
        data.questions.map(({ image, ...x }, i) => ({
          ...x,
          quizId: q.id,
          ord: i,
          sectionId: null,
          imageId: image && known.has(image.id) ? image.id : null,
          imageAlt: image && known.has(image.id) ? image.alt || null : null,
        })),
      )
      .run();
    return q;
  });
  refresh();
  return ok({ quizId: quiz.id });
}
