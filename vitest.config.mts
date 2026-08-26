import path from "node:path";
import { defineConfig } from "vitest/config";

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(process.cwd(), "tests/stubs/server-only.ts") },
      { find: "@", replacement: process.cwd() },
    ],
  },
  test: {
    fileParallelism: !runIntegrationTests,
    testTimeout: runIntegrationTests ? 30_000 : 5_000,
    include: [
      "tests/unit/**/*.test.ts",
      ...(runIntegrationTests ? ["tests/integration/**/*.test.ts"] : []),
    ],
  },
});
