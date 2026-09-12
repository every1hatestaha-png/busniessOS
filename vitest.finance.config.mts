import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(process.cwd(), "tests/stubs/server-only.ts") },
      { find: "@", replacement: process.cwd() },
    ],
  },
  test: {
    include: ["tests/finance-grade/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
