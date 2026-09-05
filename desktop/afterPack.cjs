"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * afterPack hook: ensures standalone Next.js server files (including node_modules)
 * are correctly placed in the packaged app's resources/next directory.
 *
 * electron-builder's extraResources sometimes fails to copy large node_modules
 * directories. This hook runs after packaging to guarantee the files are present.
 */
module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, "resources");
  const destDir = path.join(resourcesDir, "next");
  const stageDir = path.resolve(__dirname, "..", ".desktop-stage", "next");

  console.log("[afterPack] Ensuring standalone Next.js server in packaged output...");

  if (!fs.existsSync(stageDir)) {
    throw new Error(`[afterPack] Staging directory not found: ${stageDir}\nRun the postbuild script first.`);
  }

  // Clean destination if it exists (from extraResources attempt)
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  // Copy staged directory to resources/next using robocopy (handles OneDrive locks)
  console.log(`[afterPack] Copying ${stageDir} -> ${destDir}`);
  try {
    execSync(`robocopy "${stageDir}" "${destDir}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`, {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (err) {
    // robocopy exit codes 0-7 are success/warnings
    if (err.status > 8) {
      throw new Error(`[afterPack] robocopy failed (exit ${err.status})`);
    }
  }

  // Verify
  const checks = [
    ["server.js", fs.existsSync(path.join(destDir, "server.js"))],
    ["node_modules", fs.existsSync(path.join(destDir, "node_modules"))],
    ["next module", fs.existsSync(path.join(destDir, "node_modules", "next", "package.json"))],
    [".prisma/client", fs.existsSync(path.join(destDir, "node_modules", ".prisma", "client", "schema.prisma"))],
    ["pg module", fs.existsSync(path.join(destDir, "node_modules", "pg", "package.json"))],
  ];

  for (const [name, ok] of checks) {
    console.log(`[afterPack]   ${name}: ${ok ? "OK" : "MISSING"}`);
    if (!ok) throw new Error(`[afterPack] Critical file missing: ${name}`);
  }

  console.log("[afterPack] Standalone server files verified.");
};
