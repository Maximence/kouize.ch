"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmail, normalizeEmail } from "@/lib/auth/email";
import { currentPlayer } from "@/lib/auth/player";
import { rateLimiter } from "@/lib/auth/rate-limit";
import { currentUser, hashToken, type User } from "@/lib/auth/session";
import { classSubjects, cleanDisplayName, freeDisplayName, membership, newClassCode, ownedClass, removeMember } from "@/lib/classes";
import { db } from "@/lib/db";
import { categories, classInvites, classMembers, classes, players, quizNotes, quizzes, users, type QuizSubject } from "@/lib/db/schema";
import { sendMail, siteOrigin } from "@/lib/mail";
import { receiveQuiz } from "@/lib/publish/receive";
import { pruneNoteAssets, readNoteFiles, saveNotes } from "@/lib/notes";
import { normalizeAnswer } from "@/lib/quiz/scoring";
import { parseUpload } from "@/lib/quiz/upload";
import { CATEGORY_COLORS, SUBJECT_EMOJIS } from "@/lib/subject-style";
import { isHosted } from "@/lib/settings";
import { fail, ok, type ActionResult } from "./result";

// Classes students make for themselves ("personal") or for a group they invite
// by email ("private"). The owner is always a member, so they play and rank too.

const INVITE_DAYS = 14;
const MAX_INVITES_PER_CALL = 50;

const createLimit = rateLimiter(20, 24 * 60 * 60 * 1000);
const uploadLimit = rateLimiter(60, 60 * 60 * 1000);
const inviteLimit = rateLimiter(200, 24 * 60 * 60 * 1000);

const ClassInput = z.object({
  name: z.string().trim().min(1, "Donne un nom à la classe").max(80, "Le nom doit faire moins de 80 caractères"),
  kind: z.enum(["private", "personal"]),
});
export type MyClassInput = z.input<typeof ClassInput>;

/** The logged-in student, online only. */
async function student(): Promise<User | null> {
  return isHosted() ? currentUser() : null;
}

/** The class, when the logged-in student owns it. */
async function mine(classId: string) {
  const user = await student();
  const cls = user ? ownedClass(user.id, classId) : undefined;
  return cls && user ? { user, cls } : null;
}

export async function createMyClass(input: MyClassInput): Promise<ActionResult<{ code: string }>> {
  const user = await student();
  const player = await currentPlayer();
  if (!user || !player) return fail("Connecte-toi d'abord");
  const parsed = ClassInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!createLimit.take(user.id)) return fail("Ça fait beaucoup de nouvelles classes aujourd'hui. Réessaie demain.");
  const { name, kind } = parsed.data;
  const code = newClassCode(name);
  // A new class has nobody else in it, so the account's name is free.
  const display = cleanDisplayName(user.name) ?? cleanDisplayName("Propriétaire")!;
  db.transaction((tx) => {
    // Like the admin's classes, quizzes live in a hidden subject; this one belongs to the student.
    const cat = tx
      .insert(categories)
      .values({ userId: user.id, name: `Classe ${name}`, emoji: "🎓" })
      .returning({ id: categories.id })
      .get();
    // "-" is not a valid hash, so the class can never be joined with a password.
    const cls = tx
      .insert(classes)
      .values({ name, code, kind, ownerId: user.id, passwordHash: "-", categoryId: cat.id })
      .returning({ id: classes.id })
      .get();
    tx.insert(classMembers)
      .values({ classId: cls.id, playerId: player.id, displayName: display.name, nameKey: display.key })
      .run();
  });
  refresh();
  return ok({ code });
}

export async function updateMyClass(classId: string, input: MyClassInput): Promise<ActionResult> {
  const owned = await mine(classId);
  if (!owned) return fail("Classe introuvable");
  const parsed = ClassInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  db.update(classes).set(parsed.data).where(eq(classes.id, classId)).run();
  refresh();
  return ok();
}

/** Delete the class with its quizzes, attempts and invitations. */
export async function deleteMyClass(classId: string): Promise<ActionResult> {
  const owned = await mine(classId);
  if (!owned) return fail("Classe introuvable");
  db.transaction((tx) => {
    // Members, badges and invites go with the class; quizzes (and their attempts) with its subject.
    tx.delete(classes).where(eq(classes.id, classId)).run();
    tx.delete(categories).where(eq(categories.id, owned.cls.categoryId)).run();
  });
  pruneNoteAssets();
  redirect("/");
}

/** The matière picked for a new quiz: one already in the class (same spelling), or a new one. */
function resolveSubject(classId: string, rawName: string, rawEmoji: string): QuizSubject | string {
  const name = rawName.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  if (!name) return "Choisis une matière, ou crées-en une.";
  if (name.length > 60) return "Le nom de la matière doit faire moins de 60 caractères.";
  const existing = classSubjects(classId);
  const same = existing.find((s) => normalizeAnswer(s.name) === normalizeAnswer(name));
  if (same) return same;
  return {
    name,
    emoji: SUBJECT_EMOJIS.includes(rawEmoji) ? rawEmoji : SUBJECT_EMOJIS[0],
    color: CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length],
  };
}

/**
 * Any member adds a quiz (a JSON file or pasted text, made with their own AI or
 * exported from a studio) to a matière of the class, with the notes it was made
 * from (PDF, TXT, MD). They can hide or delete it afterwards; so can the owner.
 */
export async function uploadQuiz(classId: string, form: FormData): Promise<ActionResult<{ quizId: string }>> {
  const player = await currentPlayer();
  const cls = db.select().from(classes).where(eq(classes.id, classId)).get();
  if (!player || !cls || cls.archived || !membership(player.id, cls.id)) return fail("Classe introuvable");
  if (!uploadLimit.take(player.id)) return fail("Ça fait beaucoup d'ajouts. Réessaie dans une heure.");
  const subject = resolveSubject(cls.id, String(form.get("subject") ?? ""), String(form.get("emoji") ?? ""));
  if (typeof subject === "string") return fail(subject);
  const parsed = parseUpload(String(form.get("quiz") ?? ""));
  if (!parsed.ok) return fail(parsed.error);
  const notes = await readNoteFiles(form.getAll("notes").filter((f): f is File => f instanceof File));
  if (!notes.ok) return fail(notes.error);
  const { quizId } = receiveQuiz(cls, null, parsed.data, subject, player.id);
  saveNotes(quizId, notes.files, player.id);
  refresh();
  return ok({ quizId });
}

/** Add notes to a quiz afterwards (its uploader or the class owner). */
export async function addNotes(classId: string, quizId: string, form: FormData): Promise<ActionResult> {
  const quiz = await editableQuiz(classId, quizId);
  const player = await currentPlayer();
  if (!quiz || !player) return fail("Quiz introuvable");
  if (!uploadLimit.take(player.id)) return fail("Ça fait beaucoup d'ajouts. Réessaie dans une heure.");
  const notes = await readNoteFiles(form.getAll("notes").filter((f): f is File => f instanceof File));
  if (!notes.ok) return fail(notes.error);
  if (!notes.files.length) return fail("Choisis au moins un fichier.");
  saveNotes(quizId, notes.files, player.id);
  refresh();
  return ok();
}

/** Delete a notes file: whoever uploaded it, the uploader of its quiz, or the class owner. */
export async function deleteNote(classId: string, noteId: string): Promise<ActionResult> {
  const player = await currentPlayer();
  const note = db
    .select({ id: quizNotes.id, quizId: quizNotes.quizId, uploadedBy: quizNotes.uploadedBy })
    .from(quizNotes)
    .innerJoin(quizzes, eq(quizzes.id, quizNotes.quizId))
    .where(and(eq(quizNotes.id, noteId), eq(quizzes.classId, classId)))
    .get();
  if (!player || !note || !membership(player.id, classId)) return fail("Fichier introuvable");
  if (note.uploadedBy !== player.id && !(await editableQuiz(classId, note.quizId))) return fail("Fichier introuvable");
  db.delete(quizNotes).where(eq(quizNotes.id, noteId)).run();
  pruneNoteAssets();
  refresh();
  return ok();
}

/** A quiz of the class that the logged-in student may hide or delete: they own the class, or uploaded it. */
async function editableQuiz(classId: string, quizId: string) {
  const user = await student();
  const player = await currentPlayer();
  if (!user || !player || !membership(player.id, classId)) return null;
  const quiz = db
    .select({ id: quizzes.id, uploadedBy: quizzes.uploadedBy })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
    .get();
  if (!quiz) return null;
  return quiz.uploadedBy === player.id || ownedClass(user.id, classId) ? quiz : null;
}

export async function setMyQuizHidden(classId: string, quizId: string, hidden: boolean): Promise<ActionResult> {
  if (!(await editableQuiz(classId, quizId))) return fail("Quiz introuvable");
  db.update(quizzes).set({ hidden }).where(eq(quizzes.id, quizId)).run();
  refresh();
  return ok();
}

export async function deleteMyQuiz(classId: string, quizId: string): Promise<ActionResult> {
  if (!(await editableQuiz(classId, quizId))) return fail("Quiz introuvable");
  db.delete(quizzes).where(eq(quizzes.id, quizId)).run();
  pruneNoteAssets();
  refresh();
  return ok();
}

export async function removeMyMember(classId: string, playerId: string): Promise<ActionResult> {
  const owned = await mine(classId);
  if (!owned) return fail("Classe introuvable");
  const own = db.select({ id: players.id }).from(players).where(eq(players.userId, owned.user.id)).get();
  if (own?.id === playerId) return fail("Cette classe est à toi : supprime-la plutôt");
  removeMember(classId, playerId);
  refresh();
  return ok();
}

/** Leave a class someone else owns. Your results there are deleted. */
export async function leaveClass(classId: string): Promise<ActionResult> {
  const player = await currentPlayer();
  const user = await student();
  if (!player || !user || !membership(player.id, classId)) return fail("Tu ne fais pas partie de cette classe");
  if (ownedClass(user.id, classId)) return fail("Cette classe est à toi : supprime-la plutôt");
  removeMember(classId, player.id);
  redirect("/");
}

// ---------- Invitations ----------

export type InviteOutcome = { email: string; status: "sent" | "link" | "member"; link?: string };

/**
 * Invite people to a private class by email. Each gets a link valid for 14 days.
 * When the server can't send email, the links come back for the owner to pass on.
 */
export async function inviteToClass(classId: string, emailsText: string): Promise<ActionResult<InviteOutcome[]>> {
  const owned = await mine(classId);
  if (!owned) return fail("Classe introuvable");
  const { user, cls } = owned;
  if (cls.kind !== "private") return fail("Une classe personnelle n'est que pour toi. Rends-la privée pour inviter des gens.");
  const emails = [...new Set(emailsText.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
  if (!emails.length) return fail("Entre au moins une adresse e-mail");
  const invalid = emails.find((e) => !isEmail(e));
  if (invalid) return fail(`« ${invalid} » n'est pas une adresse e-mail`);
  if (emails.length > MAX_INVITES_PER_CALL) return fail(`Invite au plus ${MAX_INVITES_PER_CALL} personnes à la fois`);
  if (emails.includes(user.email)) return fail("Tu fais déjà partie de cette classe");

  const origin = await siteOrigin();
  const inviter = user.name || user.email;
  const results: InviteOutcome[] = [];
  for (const email of emails) {
    const member = db
      .select({ id: classMembers.playerId })
      .from(classMembers)
      .innerJoin(players, eq(players.id, classMembers.playerId))
      .innerJoin(users, eq(users.id, players.userId))
      .where(and(eq(classMembers.classId, cls.id), eq(users.email, email)))
      .get();
    if (member) {
      results.push({ email, status: "member" });
      continue;
    }
    if (!inviteLimit.take(user.id)) return fail("Ça fait beaucoup d'invitations aujourd'hui. Réessaie demain.");
    // Inviting again replaces the old link and restarts the 14 days.
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    db.insert(classInvites)
      .values({ classId: cls.id, email, tokenHash: hashToken(token), invitedBy: user.id, expiresAt })
      .onConflictDoUpdate({
        target: [classInvites.classId, classInvites.email],
        set: { tokenHash: hashToken(token), invitedBy: user.id, expiresAt, acceptedAt: null, createdAt: new Date() },
      })
      .run();
    const link = `${origin}/invite/${token}`;
    const sent = await sendMail(
      email,
      `${inviter} t'invite dans « ${cls.name} » sur KOUIZE`,
      `${inviter} t'invite à rejoindre la classe « ${cls.name} » sur KOUIZE, pour jouer à ses quiz et grimper dans son classement.\n\n` +
        `Rejoins-la ici (le lien est valable ${INVITE_DAYS} jours) :\n${link}\n\n` +
        `Pas encore de compte ? Crées-en un avec cette adresse e-mail (${email}) et l'invitation t'attendra.\n\n` +
        `Si tu ne t'y attendais pas, tu peux ignorer cet e-mail.\n`,
    );
    results.push(sent ? { email, status: "sent" } : { email, status: "link", link });
  }
  refresh();
  return ok(results);
}

export async function revokeInvite(classId: string, inviteId: string): Promise<ActionResult> {
  const owned = await mine(classId);
  if (!owned) return fail("Classe introuvable");
  db.delete(classInvites).where(and(eq(classInvites.id, inviteId), eq(classInvites.classId, classId))).run();
  refresh();
  return ok();
}

/** Join through an invitation. Returns an error message, or redirects into the class. */
async function accept(invite: typeof classInvites.$inferSelect | undefined): Promise<string> {
  const user = await student();
  const player = await currentPlayer();
  if (!user || !player) return "Connecte-toi d'abord";
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    return "Cette invitation a expiré ou a déjà été utilisée. Demandes-en une nouvelle.";
  }
  const cls = db.select().from(classes).where(eq(classes.id, invite.classId)).get();
  if (!cls || cls.archived || cls.kind !== "private") return "Cette classe n'accepte plus d'invitations.";
  if (!membership(player.id, cls.id)) {
    const name = freeDisplayName(cls.id, user.name || user.email.split("@")[0]);
    db.insert(classMembers).values({ classId: cls.id, playerId: player.id, displayName: name.name, nameKey: name.key }).run();
  }
  db.update(classInvites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(classInvites.id, invite.id), isNull(classInvites.acceptedAt)))
    .run();
  redirect(`/k/${cls.code}`);
}

/** From the link in the email (whoever has the link may use it once). */
export async function acceptInviteToken(token: string): Promise<ActionResult> {
  const invite = db.select().from(classInvites).where(eq(classInvites.tokenHash, hashToken(token))).get();
  return fail(await accept(invite));
}

/** From the home page, where invitations to your account's email are listed. */
export async function acceptInviteById(inviteId: string): Promise<ActionResult> {
  const user = await student();
  if (!user) return fail("Connecte-toi d'abord");
  const invite = db
    .select()
    .from(classInvites)
    .where(and(eq(classInvites.id, inviteId), eq(classInvites.email, user.email)))
    .get();
  return fail(await accept(invite));
}

export async function declineInvite(inviteId: string): Promise<ActionResult> {
  const user = await student();
  if (!user) return fail("Connecte-toi d'abord");
  db.delete(classInvites).where(and(eq(classInvites.id, inviteId), eq(classInvites.email, user.email))).run();
  refresh();
  return ok();
}
