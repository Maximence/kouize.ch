import "server-only";
import { randomInt } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { attempts, classMembers, players } from "@/lib/db/schema";
import { PLAYER_COOKIE } from "./cookie";
import { normalizeRecoveryCode } from "./recovery-code";
import { currentUser, hashToken } from "./session";

// Crockford base32: no I, L, O or U, so codes are easy to read aloud and retype.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** "KZ-XXXX-XXXX-XXXX-XXXX": 80 random bits. Players made before accounts used it as their identity. */
export function newRecoveryCode(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return `KZ-${groups.join("-")}`;
}

export type Player = { id: string };

/** The logged-in student's player, or null. Every class, attempt and badge hangs off it. */
export const currentPlayer = cache(async (): Promise<Player | null> => {
  const user = await currentUser();
  if (!user) return null;
  return db.select({ id: players.id }).from(players).where(eq(players.userId, user.id)).get() ?? null;
});

/** Find the player behind a recovery code. */
export function playerByCode(code: string) {
  return db.select({ id: players.id, userId: players.userId }).from(players).where(eq(players.tokenHash, hashToken(code))).get();
}

/** True when a player has played or joined nothing, so it can be replaced without losing anything. */
function isEmpty(playerId: string): boolean {
  const joined = db.select({ n: count() }).from(classMembers).where(eq(classMembers.playerId, playerId)).get()!.n;
  const played = db.select({ n: count() }).from(attempts).where(eq(attempts.playerId, playerId)).get()!.n;
  return !joined && !played;
}

/**
 * Give an account the progress of a player made before accounts (from this
 * browser's cookie or a recovery code). Only when the account has no progress of
 * its own: merging two leaderboard histories isn't supported.
 */
export function adoptPlayer(userId: string, playerId: string): "adopted" | "already-mine" | "taken" | "has-progress" {
  const target = db.select().from(players).where(eq(players.id, playerId)).get();
  if (!target) return "taken";
  if (target.userId === userId) return "already-mine";
  if (target.userId) return "taken";
  const own = db.select({ id: players.id }).from(players).where(eq(players.userId, userId)).get();
  if (own && !isEmpty(own.id)) return "has-progress";
  db.transaction((tx) => {
    if (own) tx.delete(players).where(eq(players.id, own.id)).run();
    tx.update(players).set({ userId }).where(and(eq(players.id, playerId), isNull(players.userId))).run();
  });
  return "adopted";
}

/**
 * After signing up or logging in (Server Actions only): adopt this browser's
 * pre-account player if there is one, else make sure the account has a player.
 */
export async function ensurePlayer(userId: string): Promise<Player> {
  const store = await cookies();
  const raw = store.get(PLAYER_COOKIE)?.value;
  const code = raw ? normalizeRecoveryCode(raw) : null;
  const legacy = code ? playerByCode(code) : undefined;
  if (legacy && !legacy.userId) adoptPlayer(userId, legacy.id);
  if (raw) store.delete(PLAYER_COOKIE);

  const own = db.select({ id: players.id }).from(players).where(eq(players.userId, userId)).get();
  if (own) return own;
  return db
    .insert(players)
    .values({ tokenHash: hashToken(newRecoveryCode()), userId })
    .returning({ id: players.id })
    .get();
}
