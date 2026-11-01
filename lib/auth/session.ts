import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lte, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { LOCAL_USER_ID, sessions, settings, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { isHosted } from "@/lib/settings";
import { SESSION_COOKIE, USER_COOKIE } from "./cookie";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Online, the admin (you) logs in with KOUIZE_ADMIN_PASSWORD. Everything the
 * admin manages (class subjects, quizzes) belongs to this user id. Students
 * have their own accounts (see `currentUser`).
 */
export const ADMIN_USER_ID = "admin";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Constant-time string comparison (via hashes, so lengths don't leak either). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hashToken(a), "hex"), Buffer.from(hashToken(b), "hex"));
}

/** The admin password from the environment, or null when it isn't set. */
export function adminPassword(): string | null {
  const p = process.env.KOUIZE_ADMIN_PASSWORD?.trim();
  return p ? p : null;
}

const ADMIN_HASH_KEY = "admin.passwordHash";

/**
 * The password changed from the admin page (hashed), which replaces
 * KOUIZE_ADMIN_PASSWORD. KOUIZE_ADMIN_RESET=1 ignores it, to get back in with the
 * environment's password after forgetting it.
 */
function storedAdminHash(): string | null {
  if (process.env.KOUIZE_ADMIN_RESET === "1") return null;
  return db.select().from(settings).where(eq(settings.key, ADMIN_HASH_KEY)).get()?.value ?? null;
}

export const adminLoginEnabled = () => Boolean(storedAdminHash() ?? adminPassword());

export async function checkAdminPassword(password: string): Promise<boolean> {
  const hash = storedAdminHash();
  if (hash) return verifyPassword(password, hash);
  const expected = adminPassword();
  return Boolean(expected) && safeEqual(password, expected!);
}

/** Save a new admin password and log out every other admin session (Server Actions only). */
export async function setAdminPassword(password: string) {
  const value = await hashPassword(password);
  db.insert(settings).values({ key: ADMIN_HASH_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  db.delete(sessions)
    .where(and(eq(sessions.userId, ADMIN_USER_ID), ne(sessions.id, token ? hashToken(token) : "")))
    .run();
}

/** True when the request carries a valid admin session. Looked up once per render. */
export const isAdmin = cache(async (): Promise<boolean> => {
  if (!isHosted()) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  // Expiry is compared in SQL: reading the clock during a render is flagged by Cache Components.
  return Boolean(
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, hashToken(token)),
          eq(sessions.userId, ADMIN_USER_ID),
          gt(sessions.expiresAt, sql`(unixepoch() * 1000)`),
        ),
      )
      .get(),
  );
});

/**
 * For studio pages and Server Actions: whose data to use. On your own computer
 * that's always the local user; online only the admin gets through.
 */
export async function requireUserId(): Promise<string> {
  if (!isHosted()) return LOCAL_USER_ID;
  if (!(await isAdmin())) redirect("/admin/login");
  return ADMIN_USER_ID;
}

/** For route handlers: like `requireUserId`, but null instead of a redirect. */
export async function studioUserId(): Promise<string | null> {
  if (!isHosted()) return LOCAL_USER_ID;
  return (await isAdmin()) ? ADMIN_USER_ID : null;
}

/** Start a session for `userId` and set its cookie (Server Actions only). */
async function startSession(userId: string, cookie: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, new Date()))).run();
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  (await cookies()).set(cookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    expires: expiresAt,
  });
}

async function endSession(cookie: string) {
  const store = await cookies();
  const token = store.get(cookie)?.value;
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  store.delete(cookie);
}

/** Start an admin session and set its cookie (Server Actions only). */
export async function createAdminSession() {
  db.insert(users)
    .values({ id: ADMIN_USER_ID, email: "admin", passwordHash: "-" })
    .onConflictDoNothing()
    .run();
  await startSession(ADMIN_USER_ID, SESSION_COOKIE);
}

export async function destroySession() {
  await endSession(SESSION_COOKIE);
}

// ---------- Student accounts (online copy) ----------

export type User = { id: string; email: string; name: string };

/** The student logged in on this browser, or null. Looked up once per render. */
export const currentUser = cache(async (): Promise<User | null> => {
  if (!isHosted()) return null;
  const token = (await cookies()).get(USER_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        ne(sessions.userId, ADMIN_USER_ID),
        gt(sessions.expiresAt, sql`(unixepoch() * 1000)`),
      ),
    )
    .get();
  return row ?? null;
});

/** Log a student in on this browser (Server Actions only). */
export async function createUserSession(userId: string) {
  await startSession(userId, USER_COOKIE);
}

export async function destroyUserSession() {
  await endSession(USER_COOKIE);
}

/** The host terminates HTTPS and forwards plain HTTP, so trust its header. */
export async function isHttps(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
