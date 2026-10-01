import "server-only";

import { Prisma } from "@prisma/client";

/**
 * Release a Restaurant table only when PostgreSQL says no operational or
 * settlement obligation still owns the table. The table row is locked before
 * the authoritative blocker check so order creation/re-occupation cannot race
 * a release decision.
 */
export async function releaseRestaurantTableIfSettled(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tableId: string | null,
) {
  if (!tableId) return { released: false as const, status: null as string | null };

  const tables = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id"::text AS "id", "status"
    FROM "restaurant_tables"
    WHERE "id"=${tableId}::uuid
      AND "workspaceId"=${workspaceId}::uuid
    FOR UPDATE
  `;
  const table = tables[0];
  if (!table || table.status !== "OCCUPIED") {
    return { released: false as const, status: table?.status ?? null };
  }

  const blockers = await tx.$queryRaw<Array<{ blocked: boolean }>>`
    SELECT restaurant_table_has_occupancy_blocker(
      ${tableId}::uuid,
      ${workspaceId}::uuid
    ) AS "blocked"
  `;
  if (blockers[0]?.blocked ?? true) {
    return { released: false as const, status: table.status };
  }

  const updated = await tx.$queryRaw<Array<{ status: string }>>`
    UPDATE "restaurant_tables"
    SET "status"='AVAILABLE', "updatedAt"=now()
    WHERE "id"=${tableId}::uuid
      AND "workspaceId"=${workspaceId}::uuid
      AND "status"='OCCUPIED'
    RETURNING "status"
  `;

  return {
    released: updated[0]?.status === "AVAILABLE",
    status: updated[0]?.status ?? table.status,
  };
}
