import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const DB_PATH = process.env.MDQUIZ_DB_PATH ?? path.join(process.cwd(), "data", "mdquiz.db");

type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __mdquizDb?: DB };

function open(): DB {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // Wait instead of failing when another process (e.g. a build worker) holds the lock.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/** The connection, opened on first use (not at import, so `next build` workers don't all open it). */
function getDb(): DB {
  // Reuse one connection across hot reloads in dev.
  return (globalForDb.__mdquizDb ??= open());
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
