import { connection } from "next/server";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { DB_PATH, db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { isMockMode } from "@/lib/llm";

/**
 * Deployment check: is the database readable and writable, and does data
 * survive a restart? Compare `firstSeen` before and after restarting the app.
 */
export async function GET() {
  // Per request: a response prerendered at build time would be stale (and built with the build's env).
  await connection();
  const report: Record<string, unknown> = {
    ok: false,
    node: process.version,
    hosted: process.env.KOUIZE_HOSTED === "1",
    mock: isMockMode(),
    sitePassword: Boolean(process.env.KOUIZE_SITE_PASSWORD),
  };
  try {
    report.sqlite = db.$client.prepare("select sqlite_version() as v").get();
    const now = new Date().toISOString();
    const first = db.select().from(settings).where(eq(settings.key, "health.firstSeen")).get();
    if (!first) db.insert(settings).values({ key: "health.firstSeen", value: now }).run();
    db.insert(settings)
      .values({ key: "health.lastSeen", value: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: now } })
      .run();
    report.firstSeen = first?.value ?? now;
    report.lastSeen = now;
    report.dbBytes = fs.statSync(DB_PATH).size;
    report.ok = true;
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
  }
  return Response.json(report, { status: report.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
