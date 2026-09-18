import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/*/src/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
      "**/tests/ready-anti/**/*.{test,spec}.{ts,mjs}",
      "**/tests/security-anti/**/*.{test,spec}.{ts,mjs}",
      "packages/*/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    fileParallelism: false,
  },
});
