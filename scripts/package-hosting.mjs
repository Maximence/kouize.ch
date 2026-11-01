// Build kouize-hosting.zip to upload to a Node.js host (e.g. Infomaniak).
// The app is built here, on your computer: shared hosting often stops `next build`
// (memory/time limits). The host only runs `npm install`, then `npm run start:hosted`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!fs.existsSync(".env.production")) {
  console.error("No .env.production found: copy .env.production.example to .env.production and fill it in first.");
  process.exit(1);
}

// `next build` reads .env.production. Point the database at a throwaway file so the
// build never opens your own data/mdquiz.db.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kouize-build-"));
console.log("Building the online copy…");
execFileSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", MDQUIZ_DB_PATH: path.join(scratch, "build.db") },
});
fs.rmSync(scratch, { recursive: true, force: true });

const out = "kouize-hosting.zip";
fs.rmSync(out, { force: true });
const exclude = [
  "node_modules/*", "data/*", ".git/*", "test-results/*", "playwright-report/*",
  ".env", ".env.local", ".env.*.local", "*.zip", ".DS_Store", "kouize-hosting/*",
  // Build leftovers the server doesn't need (caches, dev server, type stubs, traces).
  ".next/cache/*", ".next/dev/*", ".next/types/*", ".next/diagnostics/*", ".next/trace", ".next/trace-build",
];
// -y keeps links as links: .next/node_modules points to the server's own node_modules
// (e.g. better-sqlite3, which must be compiled for the server, not for this Mac).
execFileSync("zip", ["-rqy", out, ".", ...exclude.flatMap((p) => ["-x", p])], { stdio: "inherit" });
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`Created ${out} (${mb} MB) with the built app and .env.production.`);
console.log("On the host: build command `npm install`, start command `npm run start:hosted`.");
