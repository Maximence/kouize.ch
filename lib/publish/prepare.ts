import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { exportImages } from "@/lib/images";
import { questions, quizzes, sections } from "@/lib/db/schema";
import { callStructured } from "@/lib/llm";
import { PREPARE_SYSTEM, prepareUserPrompt } from "@/lib/prompts/prepare";
import { toExportJson, type QuizExport } from "@/lib/quiz/portable";
import { PrepareOutput } from "@/lib/quiz/schemas";
import { fallbackKeyPoints, normalizeAnswer } from "@/lib/quiz/scoring";

const SECTION_CHARS = 1500;

function load(quizId: string) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;
  const qs = db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.deletedAt)))
    .orderBy(asc(questions.ord))
    .all();
  return { quiz, qs };
}

/** Fingerprint of the quiz content, to tell whether it changed since it was published. */
export function quizContentHash(quizId: string): string | null {
  const data = load(quizId);
  if (!data) return null;
  return createHash("sha256").update(JSON.stringify(toExportJson(data.quiz, data.qs))).digest("hex");
}

/**
 * Everything the online copy needs, made with your AI provider here (one cached call):
 * key points for short answers and a study tip per section.
 */
export async function preparePublishPayload(
  userId: string,
  quizId: string,
  opts: { includeShort: boolean },
): Promise<{ payload: QuizExport; contentHash: string } | null> {
  const data = load(quizId);
  if (!data) return null;
  const { quiz } = data;
  const qs = opts.includeShort ? data.qs : data.qs.filter((q) => q.type !== "short");
  if (!qs.length) throw new Error("Plus rien à publier : ce quiz n'a que des questions à réponse courte.");
  const language = quiz.language === "fr" ? "fr" : "en";

  const short = qs.flatMap((q) =>
    q.answer.type === "short"
      ? [{ id: q.id, question: q.prompt, reference: q.answer.reference, rubric: q.answer.rubric, excerpt: q.excerpt }]
      : [],
  );
  const paths = [...new Set(qs.map((q) => q.sectionPath).filter(Boolean))];
  const sectionRows = db
    .select({ id: sections.id, content: sections.content })
    .from(sections)
    .where(inArray(sections.id, qs.flatMap((q) => (q.sectionId ? [q.sectionId] : []))))
    .all();
  const contentById = new Map(sectionRows.map((s) => [s.id, s.content]));
  const sectionInputs = paths.map((path) => {
    const related = qs.filter((q) => q.sectionPath === path);
    const source = related.map((q) => (q.sectionId ? contentById.get(q.sectionId) : undefined)).find(Boolean);
    return { path, content: (source ?? related.map((q) => q.excerpt).join("\n")).slice(0, SECTION_CHARS) };
  });

  const res = await callStructured({
    userId,
    purpose: "prepare",
    schema: PrepareOutput,
    system: PREPARE_SYSTEM,
    user: prepareUserPrompt({ language, short, sections: sectionInputs }),
    mock: () => ({
      shortAnswers: short.map((s) => ({ id: s.id, keyPoints: mockKeyPoints(s.reference, s.rubric) })),
      tips: sectionInputs.map((s) => ({ section: s.path, tip: `Mock tip: re-read “${s.path.split(" > ").at(-1)}” and redo its examples.` })),
    }),
  });

  const keyPointsById = new Map(res.data.shortAnswers.map((s) => [s.id, s.keyPoints]));
  const prepared = qs.map((q) => {
    if (q.answer.type !== "short") return q;
    const kps = (keyPointsById.get(q.id) ?? [])
      .map((k) => ({ point: k.point.trim(), keywords: [...new Set(k.keywords.map((w) => w.trim()).filter(Boolean))].slice(0, 12) }))
      .filter((k) => k.point && k.keywords.length);
    return { ...q, answer: { ...q.answer, keyPoints: kps.length ? kps.slice(0, 8) : fallbackKeyPoints(q.answer.rubric) } };
  });
  const tips = Object.fromEntries(
    res.data.tips.filter((t) => paths.includes(t.section) && t.tip.trim()).map((t) => [t.section, t.tip.trim()]),
  );

  const payload = toExportJson(quiz, prepared);
  payload.quiz.studyTips = tips;
  payload.images = exportImages(prepared.map((q) => q.imageId));
  return { payload, contentHash: quizContentHash(quizId)! };
}

/** Mock mode: the reference answer's longer words, one key point per rubric item. */
function mockKeyPoints(reference: string, rubric: string[]) {
  const words = [...new Set(normalizeAnswer(reference).split(" ").filter((w) => w.length >= 5))];
  return rubric.map((point, i) => ({
    point,
    keywords: words.length ? words.slice(i * 2, i * 2 + 3).concat(words.slice(0, 1)) : [point],
  }));
}
