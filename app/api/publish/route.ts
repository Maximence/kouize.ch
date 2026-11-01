import { adminClassByCode } from "@/lib/classes";
import { publicOrigin, publishGuard } from "@/lib/publish/endpoint";
import { PublishRequest, type PublishResponse } from "@/lib/publish/protocol";
import { receiveQuiz } from "@/lib/publish/receive";

/** Create or update a quiz in a class (called by your studio, server to server). */
export async function POST(req: Request) {
  const denied = publishGuard(req);
  if (denied) return denied;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "La requête n'est pas du JSON valide." }, { status: 400 });
  }
  const parsed = PublishRequest.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `Quiz invalide : ${issue.path.join(".")} ${issue.message}` }, { status: 400 });
  }
  const cls = adminClassByCode(parsed.data.classCode);
  if (!cls || cls.archived) return Response.json({ error: `Pas de classe « ${parsed.data.classCode} » en ligne.` }, { status: 404 });
  const { quizId, created } = receiveQuiz(cls, parsed.data.sourceId, parsed.data.quiz, parsed.data.subject);
  const body: PublishResponse = { quizId, created, url: `${publicOrigin(req)}/k/${cls.code}/q/${quizId}` };
  return Response.json(body);
}
