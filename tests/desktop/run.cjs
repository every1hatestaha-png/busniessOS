"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
async function run() {
  const { build } = await import("vite");
  await build({
    configFile: false,
    mode: "production",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: {
      "@clerk/nextjs": path.resolve("tests/desktop/clerk-fixture.ts"),
      "@": process.cwd(),
    } },
    esbuild: { jsx: "automatic", jsxDev: false },
    build: {
      outDir: ".desktop-test/renderer", emptyOutDir: false,
      lib: { entry: "tests/desktop/renderer.tsx", formats: ["iife"], name: "LogoutFixture", fileName: () => "renderer.js" },
    },
  });
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.resolve("tests/desktop/smoke.cjs")], { env, stdio: "inherit", windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Electron desktop test terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Electron desktop test exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
