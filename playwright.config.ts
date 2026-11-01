import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const env = {
  MDQUIZ_LLM_MOCK: process.env.E2E_REAL_LLM ? "" : "1",
  MDQUIZ_DB_PATH: "./data/e2e.db",
  // Empty values win over .env.production, which `next build` would otherwise load.
  KOUIZE_HOSTED: "",
  KOUIZE_SITE_PASSWORD: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: "hosted/**",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh database for every run.
    command: `rm -f data/e2e.db* && npm run db:migrate && next build && next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env,
  },
});
