/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

// The opt-in reader reuses only the fixture created by the existing dedicated
// query-plan job. Never substitute a hosted staging/customer database here.
const url = process.env.DATABASE_URL;
const target = url ? new URL(url) : null;
if (!target || !["postgres:", "postgresql:"].includes(target.protocol)
  || target.hostname !== "127.0.0.1" || target.pathname !== "/munshios_restaurant_perf") {
  throw new Error("Read performance requires the dedicated disposable loopback database.");
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  let workspace;
  try {
    const rows = (await client.query("SELECT id::text FROM workspaces WHERE name=$1", ["Restaurant performance audit"])).rows;
    if (rows.length !== 1) throw new Error("Expected exactly one synthetic query-plan workspace.");
    workspace = rows[0].id;
  } finally {
    await client.end();
  }
  execFileSync(process.execPath, [path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "tests/integration/restaurant-read-performance-certification.test.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_INTEGRATION_TESTS: "true",
      STAGING_READ_WORKSPACE: workspace,
      APPROVED_STAGING_DATABASE_HOST: "127.0.0.1",
      STAGING_PERFORMANCE_OUTPUT: process.argv[2] ?? "restaurant-read-performance-disposable.json",
    },
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
