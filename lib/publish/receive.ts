import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { classes, questions, quizzes, type QuestionAnswer, type QuizSubject } from "@/lib/db/schema";
import { getAssets, importImages } from "@/lib/images";
import type { QuizExport } from "@/lib/quiz/portable";
import { fallbackKeyPoints } from "@/lib/quiz/scoring";

type Cls = typeof classes.$inferSelect;
type Incoming = QuizExport["questions"][number];

/** Online every short answer needs key points, since there's no AI to grade it. */
function withKeyPoints(answer: QuestionAnswer): QuestionAnswer {
  if (answer.type !== "short" || answer.keyPoints?.length) return answer;
  return { ...answer, keyPoints: fallbackKeyPoints(answer.rubric) };
}

/** What identifies "the same question" across publishes (key points may be re-prepared). */
function signature(q: { type: string; prompt: string; options: string[]; answer: QuestionAnswer }) {
  const a = q.answer.type === "short" ? { ...q.answer, keyPoints: undefined } : q.answer;
  return JSON.stringify([q.type, q.prompt, q.options, a]);
}

/**
 * Create or update a published quiz in a class. On an update, unchanged questions
 * are kept (so past attempts still point at them), removed or edited ones are
 * soft-deleted, and new ones are added.
 */
export function receiveQuiz(
  cls: Cls,
  sourceId: string | null,
  data: QuizExport,
  subject?: QuizSubject,
  /** The class member uploading it (players.id), for quizzes added online. */
  uploadedBy?: string,
): { quizId: string; created: boolean } {
  // Figures first (outside the transaction: they're shared and harmless if unused).
  const referenced = data.questions.flatMap((q) => (q.image ? [q.image.id] : []));
  const known = importImages(data.images);
  for (const a of getAssets(referenced.filter((id) => !known.has(id)))) known.add(a.id);
  const imageOf = (x: Incoming) =>
    x.image && known.has(x.image.id) ? { imageId: x.image.id, imageAlt: x.image.alt || null } : { imageId: null, imageAlt: null };

  return db.transaction((tx) => {
    const existing = sourceId
      ? tx.select().from(quizzes).where(and(eq(quizzes.classId, cls.id), eq(quizzes.sourceId, sourceId))).get()
      : undefined;
    const fields = {
      title: data.quiz.title.slice(0, 200),
      language: data.quiz.language,
      studyTips: data.quiz.studyTips ?? {},
      ...(subject ? { subject } : {}),
      hidden: false,
      status: "ready" as const,
      updatedAt: new Date(),
    };
    const settings = {
      fileIds: [],
      sectionIds: null,
      count: data.questions.length,
      difficulty: "mixed" as const,
      types: [...new Set(data.questions.map((x) => x.type))],
      language: data.quiz.language,
    };
    const row = ({ image: _image, ...x }: Incoming, ord: number, quizId: string) => ({
      ...x,
      ...imageOf({ ...x, image: _image }),
      answer: withKeyPoints(x.answer),
      quizId,
      ord,
      sectionId: null,
    });

    if (!existing) {
      const quiz = tx
        .insert(quizzes)
        .values({ ...fields, categoryId: cls.categoryId, classId: cls.id, sourceId, settings, uploadedBy })
        .returning({ id: quizzes.id })
        .get();
      tx.insert(questions).values(data.questions.map((x, i) => row(x, i, quiz.id))).run();
      return { quizId: quiz.id, created: true };
    }

    tx.update(quizzes).set({ ...fields, settings }).where(eq(quizzes.id, existing.id)).run();
    const current = tx
      .select()
      .from(questions)
      .where(and(eq(questions.quizId, existing.id), isNull(questions.deletedAt)))
      .all();
    const pool = new Map<string, (typeof current)[number][]>();
    for (const q of current) {
      const sig = signature(q);
      pool.set(sig, [...(pool.get(sig) ?? []), q]);
    }
    data.questions.forEach((x, i) => {
      const keep = pool.get(signature(x))?.shift();
      if (keep) {
        tx.update(questions)
          .set({
            ord: i,
            difficulty: x.difficulty,
            explanation: x.explanation,
            excerpt: x.excerpt,
            sectionPath: x.sectionPath,
            answer: withKeyPoints(x.answer),
            ...imageOf(x),
          })
          .where(eq(questions.id, keep.id))
          .run();
      } else {
        tx.insert(questions).values(row(x, i, existing.id)).run();
      }
    });
    const leftover = [...pool.values()].flat().map((q) => q.id);
    if (leftover.length) {
      tx.update(questions).set({ deletedAt: new Date() }).where(inArray(questions.id, leftover)).run();
    }
    return { quizId: existing.id, created: false };
  });
}
