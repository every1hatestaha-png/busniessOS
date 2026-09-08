"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
async function run() {
  const { build } = await import("vite");
  await build({
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: {
      "@clerk/nextjs": path.resolve("tests/desktop/clerk-fixture.ts"),
      "@": process.cwd(),
    } },
    esbuild: { jsx: "automatic" },
    build: {
      outDir: ".desktop-test/renderer", emptyOutDir: false,
      lib: { entry: "tests/desktop/renderer.tsx", formats: ["iife"], name: "LogoutFixture", fileName: () => "renderer.js" },
    },
  });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.resolve("tests/desktop/smoke.cjs")], { env, stdio: "inherit", windowsHide: true });
  child.on("error", () => { process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code || 0; });
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
