"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const STATIC = path.join(ROOT, ".next", "static");
const PUBLIC = path.join(ROOT, "public");
const STAGE = path.join(ROOT, ".desktop-stage", "next");

function robustCopy(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  try {
    execSync(`robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`, {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (err) {
    // robocopy returns exit code 1 for "files copied" which is not an error
    if (err.status > 8) {
      throw new Error(`robocopy failed for ${src} -> ${dest} (exit ${err.status})`);
    }
  }
}

console.log("[postbuild] Preparing desktop staging directory...");

// Clean previous staging
if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true, force: true });

// 1. Copy entire .next/standalone (includes node_modules, server.js, .next, package.json)
console.log("[postbuild] Copying .next/standalone -> .desktop-stage/next");
robustCopy(STANDALONE, STAGE);

// 2. Copy .next/static into .desktop-stage/next/.next/static
const stageStatic = path.join(STAGE, ".next", "static");
if (fs.existsSync(STATIC)) {
  console.log("[postbuild] Copying .next/static -> .desktop-stage/next/.next/static");
  robustCopy(STATIC, stageStatic);
}

// 3. Copy public into .desktop-stage/next/public
const stagePublic = path.join(STAGE, "public");
if (fs.existsSync(PUBLIC)) {
  console.log("[postbuild] Copying public -> .desktop-stage/next/public");
  robustCopy(PUBLIC, stagePublic);
}

// Verify
const hasServerJs = fs.existsSync(path.join(STAGE, "server.js"));
const hasNodeModules = fs.existsSync(path.join(STAGE, "node_modules"));
const hasNextModule = fs.existsSync(path.join(STAGE, "node_modules", "next", "package.json"));
const hasPrisma = fs.existsSync(path.join(STAGE, "node_modules", ".prisma", "client", "schema.prisma"));

console.log(`[postbuild] Verification:
  server.js:     ${hasServerJs ? "OK" : "MISSING"}
  node_modules:  ${hasNodeModules ? "OK" : "MISSING"}
  next module:   ${hasNextModule ? "OK" : "MISSING"}
  prisma client: ${hasPrisma ? "OK" : "MISSING"}`);

if (!hasServerJs || !hasNodeModules || !hasNextModule) {
  console.error("[postbuild] FATAL: Critical files missing from staging directory.");
  process.exit(1);
}

console.log("[postbuild] Staging directory ready.");
