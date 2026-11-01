import { defineConfig, devices } from "@playwright/test";

// The online copy plus a studio publishing to it, both with mock AI. Run on its own: it rebuilds .next.
const HOSTED_PORT = 3211;
const STUDIO_PORT = 3212;

export default defineConfig({
  testDir: "tests/e2e/hosted",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${HOSTED_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/hosted/serve.mjs",
      url: `http://127.0.0.1:${HOSTED_PORT}/api/health`,
      // E2E_REUSE=1 runs against servers you started with `node tests/e2e/hosted/serve.mjs`.
      reuseExistingServer: Boolean(process.env.E2E_REUSE),
      timeout: 300_000,
    },
    {
      // Started by the command above; this only waits for it.
      command: "node -e \"setInterval(() => {}, 1 << 30)\"",
      url: `http://127.0.0.1:${STUDIO_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
