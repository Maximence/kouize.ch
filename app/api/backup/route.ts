import { connection } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/lib/db";
import { isHosted } from "@/lib/settings";

// Child tables after their parents, so inserts respect foreign keys.
const TABLES = [
  "categories",
  "files",
  "file_versions",
  "sections",
  "quizzes",
  "questions",
  "attempts",
  "answers",
  "review_items",
  "llm_cache",
  "settings",
  "user_settings",
];

// A backup holds every account's data, and a restore replaces it: only on your own computer.
const hostedRefusal = () =>
  Response.json({ error: "La sauvegarde de toute la base n'est pas disponible sur une version hébergée." }, { status: 403 });

/** Download a consistent snapshot of the whole database. */
export async function GET() {
  // Per request: a response prerendered at build time would be stale (and built with the build's env).
  await connection();
  if (isHosted()) return hostedRefusal();
  const tmp = path.join(os.tmpdir(), `mdquiz-backup-${Date.now()}.db`);
  await db.$client.backup(tmp);
  // API keys stay on this computer: remove them from the copy.
  const copy = new Database(tmp);
  try {
    copy.exec("delete from user_secrets; vacuum;");
  } catch {
    // older database without the table
  } finally {
    copy.close();
  }
  const data = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(data, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="mdquiz-backup-${stamp}.db"`,
    },
  });
}

/** Replace all data with an uploaded backup (migrated to the current schema first). */
export async function POST(req: Request) {
  if (isHosted()) return hostedRefusal();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier envoyé" }, { status: 400 });

  const tmp = path.join(os.tmpdir(), `mdquiz-restore-${Date.now()}.db`);
  fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
  try {
    const src = new Database(tmp);
    try {
      const tables = new Set(
        src.prepare("select name from sqlite_master where type = 'table'").all().map((r) => (r as { name: string }).name),
      );
      if (!tables.has("categories") || !tables.has("quizzes")) {
        return Response.json({ error: "Ce fichier n'est pas une sauvegarde KOUIZE." }, { status: 400 });
      }
      migrate(drizzle(src), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    } catch {
      return Response.json({ error: "Ce fichier n'est pas une base SQLite valide." }, { status: 400 });
    } finally {
      src.close();
    }

    const conn = db.$client;
    conn.pragma("foreign_keys = OFF");
    try {
      conn.prepare("attach database ? as src").run(tmp);
      conn.transaction(() => {
        for (const t of [...TABLES].reverse()) conn.prepare(`delete from main."${t}"`).run();
        for (const t of TABLES) {
          const cols = (conn.prepare(`pragma main.table_info("${t}")`).all() as { name: string }[])
            .map((c) => `"${c.name}"`)
            .join(", ");
          conn.prepare(`insert into main."${t}" (${cols}) select ${cols} from src."${t}"`).run();
        }
      })();
    } finally {
      conn.prepare("detach database src").run();
      conn.pragma("foreign_keys = ON");
    }
    return Response.json({ ok: true });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
