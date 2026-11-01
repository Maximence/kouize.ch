"use server";

import { and, eq, isNotNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { rateLimiter } from "@/lib/auth/rate-limit";
import {
  ADMIN_USER_ID,
  adminLoginEnabled,
  checkAdminPassword,
  clientIp,
  createAdminSession,
  destroySession,
  isAdmin,
  setAdminPassword,
} from "@/lib/auth/session";
import { CLASS_CODE_RE, cleanDisplayName, normalizeClassCode, removeMember, rotatePublishToken } from "@/lib/classes";
import { db } from "@/lib/db";
import { categories, classMembers, classes, quizNotes, quizzes } from "@/lib/db/schema";
import { pruneNoteAssets } from "@/lib/notes";
import { receiveQuiz } from "@/lib/publish/receive";
import { QuizExport } from "@/lib/quiz/portable";
import { isHosted } from "@/lib/settings";
import type { FormState } from "./classes";
import { fail, ok, type ActionResult } from "./result";

const loginLimit = rateLimiter(10, 15 * 60 * 1000);

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isHosted()) redirect("/");
  if (!adminLoginEnabled()) return { error: "La connexion admin est désactivée : définis KOUIZE_ADMIN_PASSWORD sur le serveur et redémarre-le." };
  if (!loginLimit.take(await clientIp())) return { error: "Trop d'essais. Attends 15 minutes et réessaie." };
  if (!(await checkAdminPassword(String(form.get("password") ?? "")))) return { error: "Mot de passe incorrect." };
  await createAdminSession();
  redirect("/admin");
}

/** Change the admin password. Other admin sessions are logged out. */
export async function changeAdminPassword(current: string, next: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  if (!loginLimit.take(await clientIp())) return fail("Trop d'essais. Attends 15 minutes et réessaie.");
  if (!(await checkAdminPassword(current))) return fail("Le mot de passe actuel est incorrect.");
  if (next.length < 10) return fail("Utilise un nouveau mot de passe d'au moins 10 caractères.");
  if (next.length > 200) return fail("Ce mot de passe est trop long.");
  await setAdminPassword(next);
  return ok();
}

export async function adminLogout() {
  await destroySession();
  redirect("/");
}

async function guard(): Promise<string | null> {
  return isHosted() && (await isAdmin()) ? null : "Connecte-toi d'abord en tant qu'admin.";
}

const ClassInput = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(80),
  code: z
    .string()
    .transform(normalizeClassCode)
    .pipe(z.string().regex(CLASS_CODE_RE, "Code : 2 à 24 lettres minuscules, chiffres ou tirets (par ex. m55)")),
  /** Empty when editing means "keep the current password". */
  password: z.string().max(200),
});
export type ClassInput = z.input<typeof ClassInput>;

function codeTaken(code: string, exceptId?: string) {
  return Boolean(
    db
      .select({ id: classes.id })
      .from(classes)
      .where(exceptId ? and(eq(classes.code, code), ne(classes.id, exceptId)) : eq(classes.code, code))
      .get(),
  );
}

export async function createClass(input: ClassInput): Promise<ActionResult<{ id: string }>> {
  const denied = await guard();
  if (denied) return fail(denied);
  const parsed = ClassInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.password.length < 4) return fail("Utilise un mot de passe de classe d'au moins 4 caractères");
  if (codeTaken(d.code)) return fail(`Le code « ${d.code} » est déjà utilisé`);
  const passwordHash = await hashPassword(d.password);
  const row = db.transaction((tx) => {
    const cat = tx
      .insert(categories)
      .values({ userId: ADMIN_USER_ID, name: `Classe ${d.name}`, emoji: "🎓" })
      .returning({ id: categories.id })
      .get();
    return tx
      .insert(classes)
      .values({ name: d.name, code: d.code, passwordHash, categoryId: cat.id })
      .returning({ id: classes.id })
      .get();
  });
  refresh();
  return ok(row);
}

export async function updateClass(id: string, input: ClassInput): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  const parsed = ClassInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.password && d.password.length < 4) return fail("Utilise un mot de passe de classe d'au moins 4 caractères");
  if (codeTaken(d.code, id)) return fail(`Le code « ${d.code} » est déjà utilisé`);
  db.update(classes)
    .set({ name: d.name, code: d.code, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) })
    .where(eq(classes.id, id))
    .run();
  refresh();
  return ok();
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  db.update(classes).set({ archived }).where(eq(classes.id, id)).run();
  refresh();
  return ok();
}

export async function setQuizHidden(quizId: string, hidden: boolean): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  db.update(quizzes).set({ hidden }).where(eq(quizzes.id, quizId)).run();
  refresh();
  return ok();
}

export async function renamePlayer(classId: string, playerId: string, rawName: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  const name = cleanDisplayName(rawName);
  if (!name) return fail("Choisis un nom d'au moins 2 lettres.");
  const taken = db
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.nameKey, name.key), ne(classMembers.playerId, playerId)))
    .get();
  if (taken) return fail(`« ${name.name} » est déjà pris dans cette classe.`);
  db.update(classMembers)
    .set({ displayName: name.name, nameKey: name.key })
    .where(and(eq(classMembers.classId, classId), eq(classMembers.playerId, playerId)))
    .run();
  refresh();
  return ok();
}

/** Delete any class (yours or a student's) with its quizzes, results, invitations and notes. */
export async function adminDeleteClass(id: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  const cls = db.select().from(classes).where(eq(classes.id, id)).get();
  if (!cls) return fail("Classe introuvable");
  db.transaction((tx) => {
    tx.delete(classes).where(eq(classes.id, id)).run();
    // Its quizzes (and their attempts and notes) live in its hidden subject.
    tx.delete(categories).where(eq(categories.id, cls.categoryId)).run();
  });
  pruneNoteAssets();
  redirect("/admin");
}

/** Delete any quiz of any class, with its attempts and notes. */
export async function adminDeleteQuiz(quizId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  db.delete(quizzes).where(and(eq(quizzes.id, quizId), isNotNull(quizzes.classId))).run();
  pruneNoteAssets();
  refresh();
  return ok();
}

export async function adminDeleteNote(noteId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  db.delete(quizNotes).where(eq(quizNotes.id, noteId)).run();
  pruneNoteAssets();
  refresh();
  return ok();
}

/** Remove a player from a class, with their attempts and badges there. */
export async function removePlayer(classId: string, playerId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return fail(denied);
  removeMember(classId, playerId);
  refresh();
  return ok();
}

/** Create (or replace) the token your studio uses to publish. Shown once. */
export async function newPublishToken(): Promise<ActionResult<{ token: string }>> {
  const denied = await guard();
  if (denied) return fail(denied);
  const token = rotatePublishToken();
  refresh();
  return ok({ token });
}

/** Add a quiz exported as JSON (e.g. from your studio's Export) to a class. */
export async function importToClass(classId: string, text: string): Promise<ActionResult<{ quizId: string }>> {
  const denied = await guard();
  if (denied) return fail(denied);
  const cls = db.select().from(classes).where(eq(classes.id, classId)).get();
  if (!cls) return fail("Classe introuvable");
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
  const { quizId } = receiveQuiz(cls, null, parsed.data);
  refresh();
  return ok({ quizId });
}
