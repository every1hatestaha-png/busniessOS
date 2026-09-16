const { spawnSync } = require("node:child_process");

function run(command, args, { allowAlreadyApplied = false } = {}) {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  const result = spawnSync(executable, args, { encoding: "utf8", env: process.env });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const alreadyApplied = output.includes("P3008") || /already recorded as applied/i.test(output);
    if (allowAlreadyApplied && alreadyApplied) {
      console.log(`[build] Migration already recorded; continuing.`);
      return;
    }
    process.exit(result.status ?? 1);
  }
}

const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (isVercelProduction) {
  // These two migrations were historically applied to the production schema before
  // Prisma's migration table was synchronized. Resolve them as applied first so a
  // deploy cannot fail on duplicate columns/tables. The command is idempotent: once
  // recorded, Prisma returns P3008 and we safely continue.
  const legacyAppliedMigrations = [
    "20260912070000_weighted_sales_defaults",
    "20260912194500_saas_control_plane",
  ];

  for (const migration of legacyAppliedMigrations) {
    console.log(`[build] Reconciling Prisma history for ${migration}...`);
    run("npx", ["prisma", "migrate", "resolve", "--applied", migration], { allowAlreadyApplied: true });
  }

  console.log("[build] Applying pending Prisma migrations to the production database...");
  run("npx", ["prisma", "migrate", "deploy"]);
}

run("npx", ["next", "build"]);
