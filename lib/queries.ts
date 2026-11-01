import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { ownsCategory, ownsFile, ownsQuiz } from "@/lib/auth/ownership";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sourceLinks } from "@/lib/source-links";
import {
  attempts,
  categories,
  files,
  fileVersions,
  questions,
  quizzes,
  sections,
} from "@/lib/db/schema";

// better-sqlite3 is synchronous, so every read first opts the render into
// request time; otherwise Cache Components would bake it into the static shell.
// Each read only returns the signed-in user's data: lists are filtered, lookups
// by id return nothing for someone else's id.

export type CategoryWithStats = Awaited<ReturnType<typeof listCategories>>[number];

export async function listCategories() {
  await connection();
  const userId = await requireUserId();
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      emoji: categories.emoji,
      createdAt: categories.createdAt,
      fileCount: sql<number>`(select count(*) from files f where f.category_id = categories.id)`,
      quizCount: sql<number>`(select count(*) from quizzes q where q.category_id = categories.id)`,
      avgScore: sql<number | null>`(
        select avg(a.score) from attempts a join quizzes q on q.id = a.quiz_id
        where q.category_id = categories.id and a.finished_at is not null)`,
      lastStudied: sql<number | null>`(
        select max(coalesce(a.finished_at, a.started_at)) from attempts a join quizzes q on q.id = a.quiz_id
        where q.category_id = categories.id)`,
    })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name))
    .all();
}

export async function getCategory(id: string) {
  await connection();
  const userId = await requireUserId();
  return db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).get() ?? null;
}

export type FileRow = Awaited<ReturnType<typeof listFiles>>[number];

export async function listFiles(categoryId: string) {
  await connection();
  if (!ownsCategory(await requireUserId(), categoryId)) return [];
  const rows = db
    .select({
      id: files.id,
      name: files.name,
      createdAt: files.createdAt,
      latestVersion: sql<number>`(select max(v.version) from file_versions v where v.file_id = files.id)`,
      updatedAt: sql<number>`(select max(v.created_at) from file_versions v where v.file_id = files.id)`,
    })
    .from(files)
    .where(eq(files.categoryId, categoryId))
    .orderBy(asc(files.name))
    .all();
  return rows.map((r) => ({ ...r, ...fileUsage(r.id) }));
}

/** Section count of the latest version, and quizzes whose questions point into any version. */
function fileUsage(fileId: string) {
  const latest = latestVersion(fileId);
  const sectionCount = latest
    ? db.select({ n: sql<number>`count(*)` }).from(sections).where(eq(sections.fileVersionId, latest.id)).get()!.n
    : 0;
  const dependentQuizzes = db
    .selectDistinct({ id: quizzes.id, title: quizzes.title })
    .from(questions)
    .innerJoin(sections, eq(sections.id, questions.sectionId))
    .innerJoin(fileVersions, eq(fileVersions.id, sections.fileVersionId))
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .where(and(eq(fileVersions.fileId, fileId), isNull(questions.deletedAt)))
    .all();
  return { sectionCount, dependentQuizzes };
}

function latestVersion(fileId: string) {
  return db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId))
    .orderBy(desc(fileVersions.version))
    .limit(1)
    .get();
}

export async function getFileWithVersion(fileId: string, version?: number) {
  await connection();
  if (!ownsFile(await requireUserId(), fileId)) return null;
  const file = db.select().from(files).where(eq(files.id, fileId)).get();
  if (!file) return null;
  const versions = db
    .select({ id: fileVersions.id, version: fileVersions.version, createdAt: fileVersions.createdAt })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId))
    .orderBy(desc(fileVersions.version))
    .all();
  const chosen = version != null ? versions.find((v) => v.version === version) : versions[0];
  if (!chosen) return null;
  const fv = db.select().from(fileVersions).where(eq(fileVersions.id, chosen.id)).get()!;
  const secs = db
    .select()
    .from(sections)
    .where(eq(sections.fileVersionId, fv.id))
    .orderBy(asc(sections.ord))
    .all();
  return { file, version: fv, versions, sections: secs };
}

/** URL of the rendered note scrolled to each section, for "open the source" links. */
export async function getSourceLinks(sectionIds: (string | null)[]) {
  await connection();
  return sourceLinks(sectionIds);
}

/** Latest-version sections of the given files, for the generation form's tree. */
export async function listLatestSections(categoryId: string) {
  await connection();
  if (!ownsCategory(await requireUserId(), categoryId)) return [];
  const fileRows = db.select().from(files).where(eq(files.categoryId, categoryId)).orderBy(asc(files.name)).all();
  return fileRows.map((f) => {
    const v = latestVersion(f.id);
    const secs = v
      ? db
          .select({
            id: sections.id,
            level: sections.level,
            heading: sections.heading,
            headingPath: sections.headingPath,
            charLen: sections.charLen,
          })
          .from(sections)
          .where(eq(sections.fileVersionId, v.id))
          .orderBy(asc(sections.ord))
          .all()
      : [];
    return { id: f.id, name: f.name, version: v?.version ?? 0, sections: secs };
  });
}

export type QuizRow = Awaited<ReturnType<typeof listQuizzes>>[number];

export async function listQuizzes(categoryId: string) {
  await connection();
  if (!ownsCategory(await requireUserId(), categoryId)) return [];
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      status: quizzes.status,
      createdAt: quizzes.createdAt,
      settings: quizzes.settings,
      questionCount: sql<number>`(select count(*) from questions x where x.quiz_id = quizzes.id and x.deleted_at is null)`,
      attemptCount: sql<number>`(select count(*) from attempts a where a.quiz_id = quizzes.id and a.finished_at is not null)`,
      bestScore: sql<number | null>`(select max(a.score) from attempts a where a.quiz_id = quizzes.id and a.finished_at is not null)`,
      lastScore: sql<number | null>`(select a.score from attempts a where a.quiz_id = quizzes.id and a.finished_at is not null order by a.finished_at desc limit 1)`,
    })
    .from(quizzes)
    .where(eq(quizzes.categoryId, categoryId))
    .orderBy(desc(quizzes.createdAt))
    .all();
}

export async function getQuiz(id: string) {
  await connection();
  if (!ownsQuiz(await requireUserId(), id)) return null;
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, id)).get();
  if (!quiz) return null;
  const qs = db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, id), isNull(questions.deletedAt)))
    .orderBy(asc(questions.ord))
    .all();
  return { quiz, questions: qs };
}

export async function listAttempts(quizId: string) {
  await connection();
  if (!ownsQuiz(await requireUserId(), quizId)) return [];
  return db
    .select()
    .from(attempts)
    .where(eq(attempts.quizId, quizId))
    .orderBy(desc(attempts.startedAt))
    .all();
}

export async function finishedAttemptScores(quizId: string) {
  await connection();
  if (!ownsQuiz(await requireUserId(), quizId)) return [];
  return db
    .select({ id: attempts.id, finishedAt: attempts.finishedAt, score: attempts.score, mode: attempts.mode })
    .from(attempts)
    .where(and(eq(attempts.quizId, quizId), isNotNull(attempts.finishedAt)))
    .orderBy(asc(attempts.finishedAt))
    .all();
}
