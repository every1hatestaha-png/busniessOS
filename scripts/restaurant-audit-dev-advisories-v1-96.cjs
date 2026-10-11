/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const expectedAdvisories = new Set([
  // Dev-only glob tooling. npm currently requires a breaking toolchain change
  // to remove this advisory; production dependency audit remains clean.
  "GHSA-vfj7-8cjw-p6xm",
  // Dev-only Electron packaging chain. Keep explicitly contained until the
  // builder chain can move without breaking desktop packaging.
  "GHSA-hp3w-g68c-fv3c",
]);

const devOnlyPaths = [
  "node_modules/braces",
  "node_modules/micromatch",
  "node_modules/fast-glob",
  "node_modules/@next/eslint-plugin-next",
  "node_modules/eslint-config-next",
  "node_modules/@ts-morph/common",
  "node_modules/ts-morph",
  "node_modules/shadcn",
  "node_modules/app-builder-lib/node_modules/@electron/get",
  "node_modules/sprintf-js",
  "node_modules/roarr",
  "node_modules/global-agent",
  "node_modules/app-builder-lib",
  "node_modules/dmg-builder",
  "node_modules/electron-builder-squirrel-windows",
  "node_modules/electron-builder",
];

const audit = spawnSync("npm", ["audit", "--json", "--audit-level=moderate"], {
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
const report = JSON.parse(audit.stdout);
if (!report.vulnerabilities || report.error) throw new Error("Dependency audit did not return a complete advisory report.");
// Validate every affected path, including nested nodes and newly introduced
// transitive packages. The historical explicit list alone can miss those.
for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!vulnerability.nodes?.length) throw new Error(`Missing advisory dependency paths: ${name}`);
  for (const dependencyPath of vulnerability.nodes) {
    if (lock.packages?.[dependencyPath]?.dev !== true) {
      throw new Error(`Advisory dependency is not provably dev-only: ${dependencyPath}`);
    }
  }
}
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
