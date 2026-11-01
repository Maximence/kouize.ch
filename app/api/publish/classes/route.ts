import { and, eq, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { classes, quizzes } from "@/lib/db/schema";
import { publishGuard } from "@/lib/publish/endpoint";
import type { RemoteClass } from "@/lib/publish/protocol";

/** The classes your studio can publish to, with what's already there. */
export async function GET(req: Request) {
  // Per request: a prerendered response would be built without KOUIZE_HOSTED.
  await connection();
  const denied = publishGuard(req);
  if (denied) return denied;
  const list = db.select().from(classes).where(and(eq(classes.archived, false), isNull(classes.ownerId))).all();
  const qs = db
    .select({ id: quizzes.id, classId: quizzes.classId, sourceId: quizzes.sourceId, title: quizzes.title, hidden: quizzes.hidden })
    .from(quizzes)
    .all()
    .filter((q) => q.classId);
  const body: RemoteClass[] = list.map((c) => ({
    code: c.code,
    name: c.name,
    quizzes: qs.filter((q) => q.classId === c.id).map(({ id, sourceId, title, hidden }) => ({ id, sourceId, title, hidden })),
  }));
  return Response.json({ classes: body });
}
