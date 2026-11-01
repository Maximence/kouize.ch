"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { currentPlayer } from "@/lib/auth/player";
import { rateLimiter } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/session";
import { classByCode, cleanDisplayName, membership } from "@/lib/classes";
import { db } from "@/lib/db";
import { classMembers } from "@/lib/db/schema";
import { isHosted } from "@/lib/settings";
import { fail, ok, type ActionResult } from "./result";

export type FormState = { error: string; values?: Record<string, string> } | null;

// Slows down password guessing: per visitor, and per class (so many IPs can't share the work).
const joinByIp = rateLimiter(10, 15 * 60 * 1000);
const joinByClass = rateLimiter(30, 15 * 60 * 1000);

/** Join an open class with its password and the name others will see. Needs an account. */
export async function joinClass(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isHosted()) redirect("/");
  const values = { code: String(form.get("code") ?? "").trim(), name: String(form.get("name") ?? "") };
  const password = String(form.get("password") ?? "");
  const player = await currentPlayer();
  if (!player) redirect(`/login?next=${encodeURIComponent(values.code ? `/k/${values.code}` : "/join")}`);
  const cls = classByCode(values.code);
  if (cls && membership(player.id, cls.id)) redirect(`/k/${cls.code}`);

  const name = cleanDisplayName(values.name);
  if (!name) return { error: "Choisis un nom d'au moins 2 lettres.", values };
  const ip = await clientIp();
  if (!joinByIp.take(ip) || !joinByClass.take(values.code.toLowerCase())) {
    return { error: "Trop d'essais. Attends 15 minutes et réessaie.", values };
  }
  // Same message for an unknown class, a wrong password and a class joined by invitation only.
  const valid = cls && !cls.archived && cls.kind === "open" && (await verifyPassword(password, cls.passwordHash));
  if (!cls || !valid) return { error: "Code de classe ou mot de passe incorrect.", values };

  const taken = db
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.classId, cls.id), eq(classMembers.nameKey, name.key)))
    .get();
  if (taken) return { error: `« ${name.name} » est déjà pris dans cette classe. Essaie un autre nom.`, values };

  db.insert(classMembers).values({ classId: cls.id, playerId: player.id, displayName: name.name, nameKey: name.key }).run();
  redirect(`/k/${cls.code}`);
}

export async function renameMe(classId: string, rawName: string): Promise<ActionResult> {
  const player = await currentPlayer();
  if (!player || !membership(player.id, classId)) return fail("Tu ne fais pas partie de cette classe");
  const name = cleanDisplayName(rawName);
  if (!name) return fail("Choisis un nom d'au moins 2 lettres.");
  const taken = db
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.nameKey, name.key), ne(classMembers.playerId, player.id)))
    .get();
  if (taken) return fail(`« ${name.name} » est déjà pris dans cette classe.`);
  db.update(classMembers)
    .set({ displayName: name.name, nameKey: name.key })
    .where(and(eq(classMembers.classId, classId), eq(classMembers.playerId, player.id)))
    .run();
  refresh();
  return ok();
}
