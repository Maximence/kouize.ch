import { connection } from "next/server";
import { z } from "zod";
import { publishGuard } from "@/lib/publish/endpoint";
import { openSuggestionsForSource, setSuggestionStatus } from "@/lib/suggestions";

/** Your studio reads students' open suggestions for one of its quizzes. */
export async function GET(req: Request) {
  await connection();
  const denied = publishGuard(req);
  if (denied) return denied;
  const sourceId = new URL(req.url).searchParams.get("sourceId") ?? "";
  if (!sourceId || sourceId.length > 64) return Response.json({ error: "Missing sourceId" }, { status: 400 });
  return Response.json({ suggestions: openSuggestionsForSource(sourceId) });
}

const Update = z.object({ ids: z.array(z.string().max(40)).max(200), status: z.enum(["open", "done", "dismissed"]) });

/** …and marks them done (or dismissed) once handled. */
export async function POST(req: Request) {
  const denied = publishGuard(req);
  if (denied) return denied;
  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  setSuggestionStatus(parsed.data.ids, parsed.data.status);
  return Response.json({ ok: true });
}
