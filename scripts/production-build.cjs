const { spawnSync } = require("node:child_process");

function run(command, args) {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  const result = spawnSync(executable, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertProductionAuthConfiguration() {
  if (process.env.VERCEL_ENV !== "production") return;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  if (!publishableKey.startsWith("pk_live_")) {
    throw new Error("Production deployment requires a Clerk live publishable key.");
  }
  if (!secretKey.startsWith("sk_live_")) {
    throw new Error("Production deployment requires a Clerk live secret key.");
  }
}

assertProductionAuthConfiguration();

// Database migrations should be an explicit release operation, not a side effect
// of every Vercel build. Running `prisma migrate deploy` during concurrent builds
// can contend on Postgres' advisory lock and fail an otherwise healthy frontend
// deployment with Prisma P1002. Set RUN_PRISMA_MIGRATIONS_ON_BUILD=1 only for a
// controlled release that intentionally includes schema changes.
const shouldRunMigrations = process.env.RUN_PRISMA_MIGRATIONS_ON_BUILD === "1";

if (shouldRunMigrations) {
  console.log("[build] Applying pending Prisma migrations...");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log("[build] Skipping Prisma migrations; run them explicitly for schema releases.");
}

run("npx", ["next", "build"]);
