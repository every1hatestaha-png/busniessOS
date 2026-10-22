/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const expectedAdvisories = new Set([
  "GHSA-vfj7-8cjw-p6xm",
  "GHSA-ch52-4w7c-c8xp",
  // No upstream patch exists yet; this transitive dependency is Electron tooling only.
  "GHSA-hp3w-g68c-fv3c",
  // Electron 44.3.0 pointerLock frame-attribution advisory, with verified app-level deny-all mitigation.
  // Upgrade to patched Electron 44.5.0 and remove this exception once lockfile is regenerated.
  "GHSA-x562-297c-g43g",
]);

const devOnlyPaths = [
  "node_modules/electron",
  "node_modules/braces",
  "node_modules/micromatch",
  "node_modules/fast-glob",
  "node_modules/@next/eslint-plugin-next",
  "node_modules/eslint-config-next",
  "node_modules/@ts-morph/common",
  "node_modules/ts-morph",
  "node_modules/shadcn",
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
if (foundAdvisories.has("ghsa-x562-297c-g43g")) {
  const desktop = fs.readFileSync("desktop/main.cjs", "utf8");
  const denyAll = "session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));";
  if (!desktop.includes(denyAll)) {
    throw new Error("Electron pointerLock advisory cannot be contained without the desktop's deny-all permission handler.");
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
