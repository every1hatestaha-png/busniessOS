import "server-only";

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { assertApprovedProductionDatabaseTarget } from "@/lib/database-target";
import { db } from "@/lib/server/db";

type AppliedMigrationRow = { migration_name: string };

export function findPendingMigrations(expected: string[], applied: string[]) {
  const appliedSet = new Set(applied);
  return expected.filter((migration) => !appliedSet.has(migration));
}

async function expectedMigrationNames() {
  const entries = await readdir(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function checkDatabaseReadiness() {
  assertApprovedProductionDatabaseTarget(process.env.DATABASE_URL);

  const [expected, rows] = await Promise.all([
    expectedMigrationNames(),
    db.$queryRaw<AppliedMigrationRow[]>`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
    `,
  ]);
  const pending = findPendingMigrations(expected, rows.map((row) => row.migration_name));
  return { ready: pending.length === 0, pendingCount: pending.length };
}
