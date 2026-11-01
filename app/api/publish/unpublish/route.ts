import { and, eq } from "drizzle-orm";
import { adminClassByCode } from "@/lib/classes";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { publishGuard } from "@/lib/publish/endpoint";
import { UnpublishRequest } from "@/lib/publish/protocol";

/** Hide a published quiz. Its attempts and leaderboard points stay. */
export async function POST(req: Request) {
  const denied = publishGuard(req);
  if (denied) return denied;
  const parsed = UnpublishRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const cls = adminClassByCode(parsed.data.classCode);
  if (!cls) return Response.json({ error: "Classe introuvable" }, { status: 404 });
  db.update(quizzes)
    .set({ hidden: true })
    .where(and(eq(quizzes.classId, cls.id), eq(quizzes.sourceId, parsed.data.sourceId)))
    .run();
  return Response.json({ ok: true });
}
