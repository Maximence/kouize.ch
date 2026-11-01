import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  files,
  fileVersions,
  questions,
  quizzes,
  sections,
  type QuizSettings,
} from "@/lib/db/schema";
import { detectLanguage } from "@/lib/lang";
import { callStructured, LlmError, toLlmError } from "@/lib/llm";
import { allocateQuestions, buildBatches, planMix, type ChunkableSection } from "@/lib/markdown/chunk";
import { excerptInSource, sameTopic, type TopicKey } from "@/lib/markdown/excerpt";
import { imageName, imageRefs } from "@/lib/markdown/images";
import { resolveImage } from "@/lib/images";
import { GENERATE_SYSTEM, generateUserPrompt } from "@/lib/prompts/generate";
import { mockGeneration } from "./mock";
import { GenerationOutput, toStoredQuestion } from "./schemas";

export type ProgressEvent =
  | { type: "start"; quizId: string; batches: number; target: number; language: "fr" | "en" }
  | { type: "batch"; index: number; batches: number; kept: number; dropped: number; cached: boolean }
  | { type: "topup"; missing: number }
  | { type: "done"; quizId: string; count: number; dropped: number; warning?: string }
  | { type: "error"; message: string };

type SectionRow = typeof sections.$inferSelect;

/**
 * Sections to generate from: the picked ones, or every section of the latest version of each file.
 * Only sections of files in `categoryId` count, so ids from another subject are ignored.
 */
export function resolveSections(categoryId: string, settings: Pick<QuizSettings, "fileIds" | "sectionIds">): SectionRow[] {
  if (settings.sectionIds?.length) {
    const rows = db
      .select({ section: sections })
      .from(sections)
      .innerJoin(fileVersions, eq(fileVersions.id, sections.fileVersionId))
      .innerJoin(files, eq(files.id, fileVersions.fileId))
      .where(and(inArray(sections.id, settings.sectionIds), eq(files.categoryId, categoryId)))
      .all()
      .map((r) => r.section);
    // Keep document order: by file version, then section order.
    return rows.sort((a, b) => a.fileVersionId.localeCompare(b.fileVersionId) || a.ord - b.ord);
  }
  return settings.fileIds.flatMap((fileId) => {
    const latest = db
      .select({ id: fileVersions.id })
      .from(fileVersions)
      .innerJoin(files, eq(files.id, fileVersions.fileId))
      .where(and(eq(fileVersions.fileId, fileId), eq(files.categoryId, categoryId)))
      .orderBy(desc(fileVersions.version))
      .limit(1)
      .get();
    if (!latest) return [];
    return db.select().from(sections).where(eq(sections.fileVersionId, latest.id)).orderBy(asc(sections.ord)).all();
  });
}

/**
 * Generate a quiz, yielding progress events. Batches run in order so each
 * call sees the questions already written and can avoid duplicates.
 */
export async function* generateQuiz(
  userId: string,
  categoryId: string,
  settings: QuizSettings,
  opts: { bypassCache?: boolean } = {},
): AsyncGenerator<ProgressEvent> {
  const secs = resolveSections(categoryId, settings);
  if (!secs.length) {
    yield { type: "error", message: "Les fichiers choisis n'ont pas de contenu pour générer des questions." };
    return;
  }
  const language =
    settings.language === "auto" ? detectLanguage(secs.map((s) => s.content).join("\n")) : settings.language;
  const chunkable: ChunkableSection[] = secs.map((s) => ({
    id: s.id,
    headingPath: s.headingPath,
    content: s.content,
    charLen: s.charLen,
  }));
  const allocations = allocateQuestions(chunkable, settings.count, { explicit: Boolean(settings.sectionIds?.length) });
  const target = allocations.reduce((a, b) => a + b.count, 0);
  if (!target) {
    yield { type: "error", message: "Les sections choisies sont trop courtes pour générer des questions." };
    return;
  }

  const quiz = db
    .insert(quizzes)
    .values({ categoryId, title: "Génération…", settings, language, status: "generating" })
    .returning()
    .get();

  const sectionById = new Map(secs.map((s) => [s.id, s]));
  // What's kept so far: later batches see it, and new questions on the same topic are dropped.
  const kept: TopicKey[] = [];
  let dropped = 0;
  let title: string | null = null;

  const runBatches = async function* (allocs: typeof allocations) {
    const batches = buildBatches(chunkable, allocs);
    const mix = planMix(batches, settings.types, settings.difficulty);
    for (const [index, batch] of batches.entries()) {
      // Short refs (S1, S2…) are easier for the model to copy than database ids.
      const refToSection = new Map(batch.parts.map((p, i) => [`S${i + 1}`, p.sectionId]));
      const input = {
        language,
        parts: batch.parts.map((p, i) => ({ ref: `S${i + 1}`, headingPath: p.headingPath, content: p.content, count: p.count })),
        types: mix[index].types,
        difficulties: mix[index].difficulties,
        existing: kept.map(({ concept, prompt }) => ({ concept, prompt })),
      };
      const res = await callStructured({
        userId,
        purpose: "generate",
        schema: GenerationOutput,
        system: GENERATE_SYSTEM,
        user: generateUserPrompt(input),
        mock: () => mockGeneration(input),
        bypassCache: opts.bypassCache,
      });
      title ??= res.data.title.trim() || null;

      let keptInBatch = 0;
      let batchDropped = 0;
      for (const q of res.data.questions) {
        const sectionId = refToSection.get(q.sectionRef.trim());
        const section = sectionId ? sectionById.get(sectionId) : undefined;
        const stored = toStoredQuestion(q);
        if (
          !section ||
          typeof stored === "string" ||
          !excerptInSource(stored.excerpt, section.content) ||
          sameTopic({ prompt: stored.prompt, concept: q.concept, excerpt: stored.excerpt }, kept)
        ) {
          batchDropped++;
          continue;
        }
        const image = sectionImage(categoryId, section.content, q.image);
        db.insert(questions)
          .values({
            ...stored,
            quizId: quiz.id,
            ord: kept.length,
            sectionId: section.id,
            sectionPath: section.headingPath,
            imageId: image?.assetId ?? null,
            imageAlt: image?.alt ?? null,
          })
          .run();
        kept.push({ prompt: stored.prompt, concept: q.concept, excerpt: stored.excerpt });
        keptInBatch++;
      }
      dropped += batchDropped;
      yield { index, batches: batches.length, kept: keptInBatch, dropped: batchDropped, cached: res.cached };
    }
  };

  try {
    yield { type: "start", quizId: quiz.id, batches: buildBatches(chunkable, allocations).length, target, language };
    for await (const p of runBatches(allocations)) yield { type: "batch", ...p };

    // One top-up round if validation dropped questions.
    const missing = target - kept.length;
    if (missing > 0 && kept.length > 0) {
      yield { type: "topup", missing };
      const largest = [...allocations].sort((a, b) => b.count - a.count).map((a) => a.sectionId);
      const topUp = allocateQuestions(
        chunkable.filter((c) => largest.includes(c.id)),
        missing,
        { explicit: true },
      );
      for await (const p of runBatches(topUp)) yield { type: "batch", ...p };
    }
  } catch (err) {
    const e = toLlmError(err);
    if (!kept.length) {
      db.delete(quizzes).where(eq(quizzes.id, quiz.id)).run();
      yield { type: "error", message: e.message };
      return;
    }
    // Keep what we have; tell the user it's partial.
    finish(quiz.id, title);
    yield {
      type: "done",
      quizId: quiz.id,
      count: kept.length,
      dropped,
      warning: `La génération s'est arrêtée avant la fin : ${e instanceof LlmError ? e.message : "erreur inattendue"}`,
    };
    return;
  }

  if (!kept.length) {
    db.delete(quizzes).where(eq(quizzes.id, quiz.id)).run();
    yield {
      type: "error",
      message: "Aucune question valide n'a pu être générée : toutes ont échoué à la vérification de la source. Essaie d'autres sections.",
    };
    return;
  }
  finish(quiz.id, title);
  yield {
    type: "done",
    quizId: quiz.id,
    count: kept.length,
    dropped,
    warning: kept.length < settings.count ? `${kept.length} questions générées sur ${settings.count} : les notes choisies sont courtes ou certaines questions ont échoué à la vérification de la source.` : undefined,
  };
}

function finish(quizId: string, title: string | null) {
  db.update(quizzes)
    .set({ title: title ?? "Quiz sans titre", status: "ready", updatedAt: new Date() })
    .where(eq(quizzes.id, quizId))
    .run();
}

/**
 * The figure a question asked for, if the section really references it and the
 * image was uploaded to the subject. Anything else is ignored.
 */
function sectionImage(categoryId: string, sectionContent: string, requested: string) {
  if (!requested.trim()) return null;
  const ref = imageRefs(sectionContent).find((r) => imageName(r.src) === imageName(requested));
  if (!ref) return null;
  const assetId = resolveImage(categoryId, ref.src);
  return assetId ? { assetId, alt: ref.alt } : null;
}
