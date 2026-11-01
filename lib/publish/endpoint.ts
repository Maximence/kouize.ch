import "server-only";
import { checkPublishToken } from "@/lib/classes";
import { isHosted } from "@/lib/settings";

/** Common checks for the publish endpoints: hosted copy, valid token. Returns an error response or null. */
export function publishGuard(req: Request): Response | null {
  if (!isHosted()) return Response.json({ error: "La publication se fait vers la version en ligne de KOUIZE." }, { status: 404 });
  if (!checkPublishToken(req.headers.get("authorization"))) {
    return Response.json({ error: "Jeton de publication incorrect. Copie-en un nouveau depuis la page admin." }, { status: 401 });
  }
  return null;
}

/** The public origin, behind the host's proxy. */
export function publicOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto || new URL(req.url).protocol.replace(":", "")}://${host}` : new URL(req.url).origin;
}
