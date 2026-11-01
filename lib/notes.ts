import "server-only";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { currentPlayer } from "@/lib/auth/player";
import { currentUser, isAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assets, classMembers, classes, quizNotes, quizzes } from "@/lib/db/schema";
import { saveAsset } from "@/lib/images";

// Course notes uploaded with a quiz, so the class can read what it was made from.
// Stored like images (content-addressed in `assets`), but only served through
// /api/notes/[id], which checks that the reader is in the class.

import { MAX_NOTE_BYTES, MAX_NOTES_PER_UPLOAD, NOTE_MIMES, sniffNote, type NoteMime } from "./note-files";

/** Check the files of one upload. Returns the accepted files or the problem, written for the student. */
export async function readNoteFiles(files: File[]): Promise<{ ok: true; files: { name: string; mime: NoteMime; data: Buffer }[] } | { ok: false; error: string }> {
  const real = files.filter((f) => f.size > 0);
  if (real.length > MAX_NOTES_PER_UPLOAD) return { ok: false, error: `Ajoute au plus ${MAX_NOTES_PER_UPLOAD} fichiers de notes à la fois.` };
  const out = [];
  for (const f of real) {
    if (f.size > MAX_NOTE_BYTES) return { ok: false, error: `${f.name} : trop volumineux (15 Mo maximum).` };
    const data = Buffer.from(await f.arrayBuffer());
    const mime = sniffNote(data, f.name);
    if (!mime) return { ok: false, error: `${f.name} : seuls les fichiers PDF, TXT et MD sont acceptés.` };
    out.push({ name: f.name.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 200) || "notes", mime, data });
  }
  return { ok: true, files: out };
}

export function saveNotes(quizId: string, files: { name: string; mime: NoteMime; data: Buffer }[], uploadedBy: string | null) {
  for (const f of files) {
    const assetId = saveAsset(f.data, f.mime);
    db.insert(quizNotes).values({ quizId, assetId, name: f.name, mime: f.mime, bytes: f.data.length, uploadedBy }).run();
  }
}

/** Delete note files nothing points to anymore (after removing notes, quizzes or classes). */
export function pruneNoteAssets() {
  const used = db.select({ id: quizNotes.assetId }).from(quizNotes);
  db.delete(assets)
    .where(and(inArray(assets.mime, [...NOTE_MIMES]), notInArray(assets.id, used)))
    .run();
}

export type ClassNote = ReturnType<typeof classNotes>[number];

/** Every note of a class, newest first, with its quiz and who uploaded it. */
export function classNotes(classId: string) {
  return db
    .select({
      id: quizNotes.id,
      name: quizNotes.name,
      mime: quizNotes.mime,
      bytes: quizNotes.bytes,
      createdAt: quizNotes.createdAt,
      uploadedBy: quizNotes.uploadedBy,
      quizId: quizzes.id,
      quizTitle: quizzes.title,
      quizHidden: quizzes.hidden,
      quizUploadedBy: quizzes.uploadedBy,
      subject: quizzes.subject,
      uploaderName: sql<string | null>`(SELECT m.display_name FROM class_members m WHERE m.class_id = ${classId} AND m.player_id = "quiz_notes"."uploaded_by")`,
    })
    .from(quizNotes)
    .innerJoin(quizzes, eq(quizzes.id, quizNotes.quizId))
    .where(eq(quizzes.classId, classId))
    .orderBy(desc(quizNotes.createdAt))
    .all();
}

/**
 * A note and its class, when the person asking may read it: the admin, or a
 * member of the class (notes of hidden quizzes only for the owner and the uploader).
 */
export async function readableNote(noteId: string) {
  const row = db
    .select({ note: quizNotes, quiz: quizzes, cls: classes })
    .from(quizNotes)
    .innerJoin(quizzes, eq(quizzes.id, quizNotes.quizId))
    .innerJoin(classes, eq(classes.id, quizzes.classId))
    .where(eq(quizNotes.id, noteId))
    .get();
  if (!row) return null;
  if (await isAdmin()) return row;
  const player = await currentPlayer();
  if (!player) return null;
  const member = db
    .select({ id: classMembers.playerId })
    .from(classMembers)
    .where(and(eq(classMembers.classId, row.cls.id), eq(classMembers.playerId, player.id)))
    .get();
  if (!member || row.cls.archived) return null;
  const mine = row.quiz.uploadedBy === player.id || row.note.uploadedBy === player.id;
  if (row.quiz.hidden && !mine && row.cls.ownerId !== (await currentUser())?.id) return null;
  return row;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
