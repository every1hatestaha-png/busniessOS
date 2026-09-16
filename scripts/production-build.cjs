const { spawnSync } = require("node:child_process");

function run(command, args) {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  const result = spawnSync(executable, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (isVercelProduction) {
  console.log("[build] Applying pending Prisma migrations to the production database...");
  run("npx", ["prisma", "migrate", "deploy"]);
}

run("npx", ["next", "build"]);
