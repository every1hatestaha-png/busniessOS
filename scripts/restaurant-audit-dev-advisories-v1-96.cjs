/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

// Only retain the two verified development-only advisories remaining after
// Electron, fast-uri, Zod, body-parser, and undici upgrades. The full audit
// continues to fail on any new or unexpected advisory.
const expectedAdvisories = new Set([
  "GHSA-ch52-4w7c-c8xp",
  // Zod v3 is pulled exclusively by the development-only shadcn CLI, not the
  // application; production Zod v4 is patched to >=4.6.6.
  "GHSA-mrhx-c7xc-m3w5",
  // ip-address is a dev-only dependency; no application-supplied IPv6 string enters that parser.
  "GHSA-rxp7-6hxx-x8q5",
]);

const devOnlyPaths = [
  "node_modules/electron",
  "node_modules/ip-address",
  "node_modules/braces",
  "node_modules/micromatch",
  "node_modules/fast-glob",
  "node_modules/@next/eslint-plugin-next",
  "node_modules/eslint-config-next",
  "node_modules/@ts-morph/common",
  "node_modules/ts-morph",
  "node_modules/shadcn",
  "node_modules/shadcn/node_modules/zod",
  "node_modules/http-cache-semantics",
  "node_modules/sprintf-js",
  "node_modules/roarr",
  "node_modules/global-agent",
  "node_modules/cacheable-request",
  "node_modules/got",
  "node_modules/app-builder-lib/node_modules/@electron/get",
];

const audit = spawnSync("npm", ["audit", "--audit-level=moderate"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

const output = `${audit.stdout || ""}\n${audit.stderr || ""}`;
process.stdout.write(output);

if (audit.error) throw audit.error;
if (audit.status === 0) {
  console.log("Full dependency audit is clean; no V1.96 advisory exception is needed.");
  process.exit(0);
}

const foundAdvisories = new Set(
  [...output.matchAll(/GHSA-[a-z0-9-]+/gi)].map((match) => match[0].toLowerCase()),
);
const expectedLower = new Set([...expectedAdvisories].map((value) => value.toLowerCase()));
// GHSA-x562-297c-g43g affects Electron apps granting pointerLock based on a
// misattributed cross-origin iframe origin. Our desktop must continue rejecting
// every permission request. Fail the audit if that mitigation is removed.
if (["ghsa-x562-297c-g43g", "ghsa-3qxv-5xgr-q7w9", "ghsa-h3v5-h239-pg29"].some((id) => foundAdvisories.has(id))) {
  const desktop = fs.readFileSync("desktop/main.cjs", "utf8");
  const denyAll = "session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));";
  if (!desktop.includes(denyAll)) {
    throw new Error("Electron permission advisory requires the desktop's deny-all permission handler.");
  }
  if (desktop.includes("beginFrameSubscription") || desktop.includes("offscreen")) {
    throw new Error("Electron frame-capture advisory requires a patched dependency if frame subscriptions or offscreen rendering are used.");
  }
}


for (const advisory of foundAdvisories) {
  if (!expectedLower.has(advisory)) {
    throw new Error(`Unexpected dependency advisory in V1.96 audit: ${advisory}`);
  }
}
for (const advisory of expectedLower) {
  if (!foundAdvisories.has(advisory)) {
    throw new Error(
      `Expected temporary dev-only advisory ${advisory} is no longer present. Re-evaluate dependencies and remove the exception instead of silently carrying it.`,
    );
  }
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
for (const path of devOnlyPaths) {
  const entry = lock.packages?.[path];
  if (!entry) continue;
  if (entry.dev !== true) {
    throw new Error(`Known advisory dependency escaped the dev-only graph: ${path}`);
  }
}

console.log(
  "Full audit is non-zero only for the explicitly recognized V1.96 dev-only advisory set; production dependency audit must still pass separately.",
);
