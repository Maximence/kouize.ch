import { NextResponse, type NextRequest } from "next/server";

/** Studio pages and endpoints: on your own computer only. */
const STUDIO_PATHS = ["/c", "/q", "/settings", "/review", "/api/generate", "/api/backup", "/api/quizzes"];
/** Called by your studio with its own token, so the optional site password doesn't apply. */
const TOKEN_PATHS = ["/api/publish", "/api/health"];

const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * On the online copy (KOUIZE_HOSTED=1) the studio pages don't exist: quizzes
 * are made on your computer and published. This is only a first filter: every
 * page, action and route still checks who is asking (player, admin, studio).
 *
 * KOUIZE_SITE_PASSWORD optionally puts the whole site behind one shared
 * password first (e.g. while testing). Both do nothing on your own computer.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const password = process.env.KOUIZE_SITE_PASSWORD;
  if (password && !under(pathname, TOKEN_PATHS) && !hasSitePassword(request, password)) {
    return new NextResponse("Password required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="KOUIZE", charset="UTF-8"' },
    });
  }
  if (process.env.KOUIZE_HOSTED === "1" && under(pathname, STUDIO_PATHS)) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.rewrite(new URL("/_studio-only", request.url)); // no such page: renders the 404
  }
  return NextResponse.next();
}

function hasSitePassword(request: NextRequest, password: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  return safeEqual(decoded.slice(decoded.indexOf(":") + 1), password);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's static assets and the browser-tab icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
