"use strict";

const { spawn } = require("node:child_process");
const { watch } = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "..");
loadEnvConfig(root, true);
const port = Number(process.env.BUSINESSOS_DEV_PORT || 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 49200) {
  throw new Error("BUSINESSOS_DEV_PORT must be an available port from 1024 to 65535, excluding 49200");
}
const origin = `http://localhost:${port}`;
const env = { ...process.env, NODE_ENV: "development", BUSINESSOS_DEV_ORIGIN: origin };
delete env.ELECTRON_RUN_AS_NODE;
let electron;
let stopping = false;
let restarting = false;
let debounce;
let watcher;
let forceQuit;

// Next stays alive during Electron restarts, preserving Fast Refresh and caches.
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "localhost", "--port", String(port)], {
  cwd: root, env, stdio: "inherit", windowsHide: true,
});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(debounce);
  watcher?.close();
  next.kill();
  if (electron?.connected) electron.send("desktop:restart");
  else electron?.kill();
  forceQuit = setTimeout(() => { electron?.kill(); process.exit(code); }, 5000);
  forceQuit.unref();
  process.exitCode = code;
}

function launchElectron() {
  console.log(`[D6][dev] launching Electron at ${origin}; no packaging`);
  const args = [root];
  if (process.env.BUSINESSOS_DEV_INSPECT_PORT) {
    const debugPort = Number(process.env.BUSINESSOS_DEV_INSPECT_PORT);
    if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65535) throw new Error("Invalid development inspector port");
    args.push(`--remote-debugging-port=${debugPort}`);
  }
  electron = spawn(require("electron"), args, {
    cwd: root, env, stdio: ["inherit", "inherit", "inherit", "ipc"], windowsHide: false,
  });
  electron.once("error", (error) => { console.error(`[D6][dev] Electron failed: ${error.code}`); stop(1); });
  electron.once("exit", () => {
    clearTimeout(forceQuit);
    if (restarting && !stopping) { restarting = false; launchElectron(); }
    else stop();
  });
}

async function ready() {
  const deadline = Date.now() + 120000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok && !stopping) {
        launchElectron();
        watcher = watch(__dirname, (_event, filename) => {
          if (!["main.cjs", "preload.cjs"].includes(String(filename))) return;
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (stopping || restarting) return;
            restarting = true;
            console.log(`[D6][dev] ${filename} changed; restarting Electron (Next stays running)`);
            if (electron.connected) electron.send("desktop:restart");
            else electron.kill();
          }, 500);
        });
        return;
      }
    } catch { /* Next is still compiling the health endpoint. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!stopping) { console.error("[D6][dev] Next startup timed out"); stop(1); }
}

next.once("error", (error) => { console.error(`[D6][dev] Next failed: ${error.code}`); stop(1); });
next.once("exit", (code) => { if (!stopping) stop(code || 1); });
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
void ready();
