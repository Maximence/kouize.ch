import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { LOCAL_USER_ID, attempts, classMembers, classes, quizzes } from "@/lib/db/schema";
import { isHosted } from "@/lib/settings";
import { ownsAttempt, ownsQuiz } from "./ownership";
import { currentPlayer } from "./player";
import { ADMIN_USER_ID, isAdmin } from "./session";

/**
 * Who is looking at a quiz or attempt:
 * - "studio": you, on your own computer (local user) or logged in as admin online;
 * - "player": a class member online, identified by their browser.
 */
export type Viewer = { kind: "studio"; userId: string } | { kind: "player"; playerId: string };

/**
 * Everyone this browser can act as, most specific first. Online, the admin may
 * also have joined a class as a player: in a class they play as that player, so
 * their results reach the leaderboard.
 */
async function candidates(): Promise<Viewer[]> {
  if (!isHosted()) return [{ kind: "studio", userId: LOCAL_USER_ID }];
  const list: Viewer[] = [];
  const player = await currentPlayer();
  if (player) list.push({ kind: "player", playerId: player.id });
  if (await isAdmin()) list.push({ kind: "studio", userId: ADMIN_USER_ID });
  return list;
}

/** Who may start this quiz: a class member first, else its owner. */
export async function viewerForQuiz(quizId: string): Promise<Viewer | null> {
  return (await candidates()).find((v) => canUseQuiz(v, quizId)) ?? null;
}

/** Who may open this attempt: the player who took it first, else the owner. */
export async function viewerForAttempt(attemptId: string): Promise<Viewer | null> {
  return (await candidates()).find((v) => canUseAttempt(v, attemptId)) ?? null;
}

/** A published quiz the player may play: listed, in a live class they belong to. */
export function playableQuiz(playerId: string, quizId: string) {
  return db
    .select({ quiz: quizzes, cls: classes })
    .from(quizzes)
    .innerJoin(classes, eq(classes.id, quizzes.classId))
    .innerJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.playerId, playerId)))
    .where(and(eq(quizzes.id, quizId), eq(quizzes.hidden, false), eq(classes.archived, false)))
    .get();
}

export function canUseQuiz(viewer: Viewer, quizId: string): boolean {
  if (viewer.kind === "studio") return ownsQuiz(viewer.userId, quizId);
  return Boolean(playableQuiz(viewer.playerId, quizId));
}

/** Players reach only their own attempts, and only while they're still in the class. */
export function canUseAttempt(viewer: Viewer, attemptId: string): boolean {
  if (viewer.kind === "studio") return ownsAttempt(viewer.userId, attemptId);
  const row = db
    .select({ playerId: attempts.playerId })
    .from(attempts)
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .innerJoin(classMembers, and(eq(classMembers.classId, quizzes.classId), eq(classMembers.playerId, viewer.playerId)))
    .where(eq(attempts.id, attemptId))
    .get();
  return row?.playerId === viewer.playerId;
}

/** Where "back to the quiz" goes for this viewer. */
export function quizHref(viewer: Viewer, quizId: string): string {
  if (viewer.kind === "studio") return `/q/${quizId}`;
  const row = db
    .select({ code: classes.code })
    .from(quizzes)
    .innerJoin(classes, eq(classes.id, quizzes.classId))
    .where(eq(quizzes.id, quizId))
    .get();
  return row ? `/k/${row.code}/q/${quizId}` : "/";
}
