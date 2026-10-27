"use strict";
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const port = 33218;
const origin = "http://localhost:" + port;
// Synthetic public configuration only. This probe exercises unauthenticated route guards,
// never sends a credential, and must not rely on production or staging secrets.
const env = {
  ...process.env,
  NODE_ENV: "development",
  BUSINESSOS_DEV_PORT: String(port),
  BUSINESSOS_DEV_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: "https://localhost-smoke.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_localhost_smoke_test",
};
delete env.DATABASE_URL;
delete env.CLERK_SECRET_KEY;
delete env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "localhost", "--port", String(port)], {
  cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true
});
let output = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
  output = (output + chunk.toString()).slice(-16000);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Next server exited early: " + output);
    try {
      const response = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(4000), redirect: "manual" });
      if (response.status === 200 && (await response.json()).ok === true) break;
    } catch {}
    await pause(600);
  }
  const health = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(10000) });
  assert.equal(health.status, 200, "localhost health must be ready");
  for (const page of ["/restaurant/pos", "/restaurant/kitchen", "/restaurant/manager"]) {
    const response = await fetch(origin + page, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.ok([200, 301, 302, 303, 307, 308, 401, 403].includes(response.status),
      page + " unexpected response " + response.status + ". Logs: " + output);
    console.log("LOCALHOST_ROUTE", page, response.status);
  }
  console.log("PASS: real Next localhost process and Restaurant route smoke. No installer or live account used.");
}
check().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  child.kill();
  await pause(1200);
  if (child.exitCode === null) {
    const { execFileSync } = require("node:child_process");
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    } else child.kill("SIGKILL");
  }
});
