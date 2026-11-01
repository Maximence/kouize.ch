import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, classInvites, classMembers, classes, playerBadges, players, quizzes, settings, users } from "@/lib/db/schema";
import { hashToken, safeEqual } from "@/lib/auth/session";
import { normalizeAnswer } from "@/lib/quiz/scoring";

export const CLASS_CODE_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;

export const normalizeClassCode = (code: string) => code.trim().toLowerCase();

/** "  Ana  Lou " → display "Ana Lou", key "ana lou". Null when nothing usable is left. */
export function cleanDisplayName(raw: string): { name: string; key: string } | null {
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
  const key = normalizeAnswer(name);
  return name.length >= 2 && key ? { name, key } : null;
}

/** A free, unguessable-enough code for a student's class: "biology-7k2q9x". */
export function newClassCode(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16)
    .replace(/-+$/, "");
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  for (;;) {
    const suffix = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const code = slug.length >= 2 ? `${slug}-${suffix}` : `class-${suffix}`;
    if (!classByCode(code)) return code;
  }
}

/** The name as wanted, or "Ana 2", "Ana 3"… when someone in the class already has it. */
export function freeDisplayName(classId: string, wanted: string): { name: string; key: string } {
  const base = cleanDisplayName(wanted) ?? cleanDisplayName("Joueur")!;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : cleanDisplayName(`${base.name.slice(0, 20)} ${n}`)!;
    const taken = db
      .select({ id: classMembers.playerId })
      .from(classMembers)
      .where(and(eq(classMembers.classId, classId), eq(classMembers.nameKey, candidate.key)))
      .get();
    if (!taken) return candidate;
  }
}

/** A class the student made (and can manage), by id. */
export function ownedClass(userId: string, classId: string) {
  return db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.ownerId, userId)))
    .get();
}

/** Invitations still waiting for an answer, for the class's owner. */
export function classInviteList(classId: string) {
  return db
    .select({
      id: classInvites.id,
      email: classInvites.email,
      createdAt: classInvites.createdAt,
      // Compared in SQL: reading the clock during a render is flagged by Cache Components.
      expired: sql<boolean>`${classInvites.expiresAt} <= (unixepoch() * 1000)`.mapWith(Boolean),
    })
    .from(classInvites)
    .where(and(eq(classInvites.classId, classId), isNull(classInvites.acceptedAt)))
    .orderBy(desc(classInvites.createdAt))
    .all();
}

/** Classes this email was invited to and hasn't joined yet (shown on the home page, in case the email got lost). */
export function pendingInvitesFor(email: string, playerId: string) {
  return db
    .select({ id: classInvites.id, classId: classes.id, className: classes.name, ownerName: users.name })
    .from(classInvites)
    .innerJoin(classes, eq(classes.id, classInvites.classId))
    .leftJoin(users, eq(users.id, classes.ownerId))
    .leftJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.playerId, playerId)))
    .where(
      and(
        eq(classInvites.email, email),
        isNull(classInvites.acceptedAt),
        isNull(classMembers.playerId),
        eq(classes.archived, false),
        gt(classInvites.expiresAt, sql`(unixepoch() * 1000)`),
      ),
    )
    .orderBy(desc(classInvites.createdAt))
    .all();
}

/** The account behind a class member, for the owner's member list (email included). */
export function memberAccounts(classId: string) {
  return db
    .select({
      playerId: classMembers.playerId,
      name: classMembers.displayName,
      joinedAt: classMembers.joinedAt,
      email: users.email,
    })
    .from(classMembers)
    .innerJoin(players, eq(players.id, classMembers.playerId))
    .leftJoin(users, eq(users.id, players.userId))
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(classMembers.nameKey))
    .all();
}

export function classByCode(code: string) {
  return db.select().from(classes).where(eq(classes.code, normalizeClassCode(code))).get();
}

/** One of the admin's classes (the ones your studio publishes to), never a student's. */
export function adminClassByCode(code: string) {
  return db
    .select()
    .from(classes)
    .where(and(eq(classes.code, normalizeClassCode(code)), isNull(classes.ownerId)))
    .get();
}

export function membership(playerId: string, classId: string) {
  return db
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.playerId, playerId), eq(classMembers.classId, classId)))
    .get();
}

/** Classes a player belongs to (not archived). */
export function playerClasses(playerId: string) {
  return db
    .select({ cls: classes, name: classMembers.displayName })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.playerId, playerId), eq(classes.archived, false)))
    .orderBy(asc(classes.name))
    .all();
}

/** Listed quizzes of a class with question counts and, for a player, their best score. */
// Subqueries name the outer table explicitly: in single-table selects Drizzle writes columns
// without their table, and a bare "id" would resolve to the subquery's own table.
export function classQuizzes(classId: string, playerId?: string) {
  const rows = db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      language: quizzes.language,
      subject: quizzes.subject,
      createdAt: quizzes.createdAt,
      updatedAt: quizzes.updatedAt,
      questionCount: sql<number>`(SELECT count(*) FROM questions q WHERE q.quiz_id = "quizzes"."id" AND q.deleted_at IS NULL)`,
    })
    .from(quizzes)
    .where(and(eq(quizzes.classId, classId), eq(quizzes.hidden, false)))
    .orderBy(desc(quizzes.createdAt))
    .all();
  if (!playerId) return rows.map((r) => ({ ...r, best: null as number | null, attempts: 0 }));
  const mine = db
    .select({ quizId: attempts.quizId, best: sql<number | null>`max(${attempts.score})`, n: count() })
    .from(attempts)
    .where(and(eq(attempts.playerId, playerId), isNotNull(attempts.finishedAt)))
    .groupBy(attempts.quizId)
    .all();
  const byQuiz = new Map(mine.map((m) => [m.quizId, m]));
  return rows.map((r) => ({ ...r, best: byQuiz.get(r.id)?.best ?? null, attempts: byQuiz.get(r.id)?.n ?? 0 }));
}

/** Everything in a class, for the admin. */
export function adminClassQuizzes(classId: string) {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      subject: quizzes.subject,
      hidden: quizzes.hidden,
      updatedAt: quizzes.updatedAt,
      questionCount: sql<number>`(SELECT count(*) FROM questions q WHERE q.quiz_id = "quizzes"."id" AND q.deleted_at IS NULL)`,
      attemptCount: sql<number>`(SELECT count(*) FROM attempts a WHERE a.quiz_id = "quizzes"."id" AND a.finished_at IS NOT NULL)`,
      uploadedBy: quizzes.uploadedBy,
      uploaderName: sql<string | null>`(SELECT m.display_name FROM class_members m WHERE m.class_id = "quizzes"."class_id" AND m.player_id = "quizzes"."uploaded_by")`,
    })
    .from(quizzes)
    .where(eq(quizzes.classId, classId))
    .orderBy(desc(quizzes.createdAt))
    .all();
}

export function classMemberList(classId: string) {
  return db
    .select({ playerId: classMembers.playerId, name: classMembers.displayName, joinedAt: classMembers.joinedAt })
    .from(classMembers)
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(classMembers.nameKey))
    .all();
}

/** Take a player out of a class, with their attempts and badges there. */
export function removeMember(classId: string, playerId: string) {
  const quizIds = db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.classId, classId)).all().map((q) => q.id);
  db.transaction((tx) => {
    if (quizIds.length) {
      tx.delete(attempts).where(and(eq(attempts.playerId, playerId), inArray(attempts.quizId, quizIds))).run();
    }
    tx.delete(playerBadges).where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.classId, classId))).run();
    tx.delete(classMembers).where(and(eq(classMembers.playerId, playerId), eq(classMembers.classId, classId))).run();
  });
}

// ---------- Publishing token ----------

const TOKEN_KEY = "publish.tokenHash";

/** A new token replaces the old one. Only its hash is kept: it's shown once. */
export function rotatePublishToken(): string {
  const token = `kzp_${randomBytes(24).toString("base64url")}`;
  db.insert(settings)
    .values({ key: TOKEN_KEY, value: hashToken(token) })
    .onConflictDoUpdate({ target: settings.key, set: { value: hashToken(token) } })
    .run();
  return token;
}

export function hasPublishToken(): boolean {
  return Boolean(db.select().from(settings).where(eq(settings.key, TOKEN_KEY)).get());
}

/** Checks an `Authorization: Bearer …` header against the stored token. */
export function checkPublishToken(header: string | null): boolean {
  const stored = db.select().from(settings).where(eq(settings.key, TOKEN_KEY)).get()?.value;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(stored && token && safeEqual(hashToken(token), stored));
}

/** Quizzes without a subject (e.g. imported from a file) go in this group. */
export const OTHER_SUBJECT = { key: "autres", name: "Autres quiz", emoji: "📂", color: "#e3cfa6" };

export type ClassQuiz = ReturnType<typeof classQuizzes>[number];

export const subjectKey = (q: Pick<ClassQuiz, "subject">) => q.subject?.name ?? OTHER_SUBJECT.key;

/** A class's quizzes grouped by the studio subject they came from, in alphabetical order. */
export function groupBySubject(list: ClassQuiz[]) {
  const groups = new Map<string, { key: string; name: string; emoji: string; color: string; quizzes: ClassQuiz[] }>();
  for (const q of list) {
    const key = subjectKey(q);
    const g = groups.get(key) ?? {
      key,
      name: q.subject?.name ?? OTHER_SUBJECT.name,
      emoji: q.subject?.emoji ?? OTHER_SUBJECT.emoji,
      color: q.subject?.color ?? OTHER_SUBJECT.color,
      quizzes: [],
    };
    g.quizzes.push(q);
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.key === OTHER_SUBJECT.key) - Number(b.key === OTHER_SUBJECT.key) || a.name.localeCompare(b.name),
  );
}
