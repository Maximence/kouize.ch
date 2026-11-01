// One build, two servers: the online copy (hosted) and a studio that publishes to it.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

export const HOSTED_PORT = 3211;
export const STUDIO_PORT = 3212;

for (const f of fs.readdirSync("data").filter((f) => /^e2e-(hosted|studio)\.db/.test(f))) fs.rmSync(`data/${f}`);

const common = { ...process.env, MDQUIZ_LLM_MOCK: "1", KOUIZE_SITE_PASSWORD: "" };
const hosted = { ...common, MDQUIZ_DB_PATH: "./data/e2e-hosted.db", KOUIZE_HOSTED: "1", KOUIZE_ADMIN_PASSWORD: "admin-e2e" };
// Empty values win over .env.production, which `next start` would otherwise load.
const studio = { ...common, MDQUIZ_DB_PATH: "./data/e2e-studio.db", KOUIZE_HOSTED: "", KOUIZE_ADMIN_PASSWORD: "" };

execSync("node scripts/migrate.mjs", { env: hosted, stdio: "inherit" });
execSync("node scripts/migrate.mjs", { env: studio, stdio: "inherit" });
execSync("npx next build", { env: studio, stdio: "inherit" });

const children = [
  spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(STUDIO_PORT)], { env: studio, stdio: "inherit" }),
  spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(HOSTED_PORT)], { env: hosted, stdio: "inherit" }),
];
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
for (const c of children) c.on("exit", (code) => code && stop());
