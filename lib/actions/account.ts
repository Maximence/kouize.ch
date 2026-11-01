"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { MIN_PASSWORD, isEmail, normalizeEmail, safeNext } from "@/lib/auth/email";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { adoptPlayer, ensurePlayer, playerByCode } from "@/lib/auth/player";
import { rateLimiter } from "@/lib/auth/rate-limit";
import { normalizeRecoveryCode } from "@/lib/auth/recovery-code";
import { ADMIN_USER_ID, clientIp, createUserSession, currentUser, destroyUserSession } from "@/lib/auth/session";
import { cleanDisplayName } from "@/lib/classes";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isHosted } from "@/lib/settings";
import type { FormState } from "./classes";
import { fail, ok, type ActionResult } from "./result";

const signupByIp = rateLimiter(10, 60 * 60 * 1000);
const loginByIp = rateLimiter(20, 15 * 60 * 1000);
const loginByEmail = rateLimiter(10, 15 * 60 * 1000);
const recoverByIp = rateLimiter(10, 15 * 60 * 1000);

// Hashed once, so logging in with an unknown email takes as long as with a wrong password.
const dummyHash = hashPassword("not a real password");

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isHosted()) redirect("/");
  const values = { name: String(form.get("name") ?? ""), email: normalizeEmail(String(form.get("email") ?? "")) };
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const name = cleanDisplayName(values.name);
  if (!name) return { error: "Choisis un nom d'au moins 2 lettres.", values };
  if (!isEmail(values.email)) return { error: "Entre une adresse e-mail valide.", values };
  if (password.length < MIN_PASSWORD) return { error: `Utilise un mot de passe d'au moins ${MIN_PASSWORD} caractères.`, values };
  if (password.length > 200) return { error: "Ce mot de passe est trop long.", values };
  if (!signupByIp.take(await clientIp())) return { error: "Trop de nouveaux comptes depuis ici. Réessaie dans une heure.", values };
  if (db.select({ id: users.id }).from(users).where(eq(users.email, values.email)).get()) {
    return { error: "Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.", values };
  }
  const user = db
    .insert(users)
    .values({ email: values.email, name: name.name, passwordHash: await hashPassword(password) })
    .returning({ id: users.id })
    .get();
  await ensurePlayer(user.id);
  await createUserSession(user.id);
  redirect(next);
}

export async function logIn(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isHosted()) redirect("/");
  const values = { email: normalizeEmail(String(form.get("email") ?? "")) };
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!loginByIp.take(await clientIp()) || !loginByEmail.take(values.email)) {
    return { error: "Trop d'essais. Attends 15 minutes et réessaie.", values };
  }
  const user = db.select().from(users).where(eq(users.email, values.email)).get();
  const student = user && user.id !== ADMIN_USER_ID ? user : null;
  const valid = await verifyPassword(password, student?.passwordHash ?? (await dummyHash));
  if (!student || !valid) return { error: "E-mail ou mot de passe incorrect.", values };
  loginByEmail.reset(values.email);
  await ensurePlayer(student.id);
  await createUserSession(student.id);
  redirect(next);
}

export async function logOut() {
  await destroyUserSession();
  redirect("/");
}

/** The name others see by default when you join a class. */
export async function renameAccount(rawName: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return fail("Connecte-toi d'abord");
  const name = cleanDisplayName(rawName);
  if (!name) return fail("Choisis un nom d'au moins 2 lettres.");
  db.update(users).set({ name: name.name }).where(eq(users.id, user.id)).run();
  refresh();
  return ok();
}

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return fail("Connecte-toi d'abord");
  if (next.length < MIN_PASSWORD) return fail(`Utilise un mot de passe d'au moins ${MIN_PASSWORD} caractères.`);
  if (next.length > 200) return fail("Ce mot de passe est trop long.");
  if (!loginByIp.take(await clientIp())) return fail("Trop d'essais. Attends 15 minutes et réessaie.");
  const row = db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await verifyPassword(current, row.passwordHash))) return fail("Ton mot de passe actuel est incorrect.");
  db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id)).run();
  return ok();
}

/** Bring progress from before accounts (its recovery code) into this account. */
export async function restorePlayer(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isHosted()) redirect("/");
  const user = await currentUser();
  if (!user) redirect("/login?next=/join");
  const raw = String(form.get("recovery") ?? "");
  if (!recoverByIp.take(await clientIp())) return { error: "Trop d'essais. Attends 15 minutes et réessaie.", values: { recovery: raw } };
  const code = normalizeRecoveryCode(raw);
  const player = code ? playerByCode(code) : undefined;
  if (!code || !player) return { error: "Ce code de récupération ne correspond à aucun joueur.", values: { recovery: raw } };
  const result = adoptPlayer(user.id, player.id);
  if (result === "taken") return { error: "Cette progression appartient déjà à un autre compte.", values: { recovery: raw } };
  if (result === "has-progress") {
    return { error: "Ce compte a déjà sa propre progression : l'ancienne ne peut pas y être ajoutée.", values: { recovery: raw } };
  }
  redirect("/");
}
