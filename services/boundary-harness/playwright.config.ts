import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "8099";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `DATABASE_PATH=/tmp/harness-e2e.db PORT=${port} HARNESS_MODE=api pnpm --filter @harness/api start`,
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
