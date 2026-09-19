import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "8099";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `rm -f /tmp/harness-e2e.db /tmp/harness-e2e.db-wal /tmp/harness-e2e.db-shm && DATABASE_PATH=/tmp/harness-e2e.db PORT=${port} HARNESS_MODE=api pnpm --filter @harness/api start`,
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    { name: "gate-inbox", testDir: "./apps/web/e2e/gate-inbox" },
    { name: "inbox-legacy", testDir: "./tests/e2e" },
  ],
});
