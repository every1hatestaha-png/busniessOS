import { Prisma } from "@prisma/client";

import { db } from "@/lib/server/db";
import { getWarehouseReconciliation } from "@/lib/server/warehouse-reconciliation";

export type WarehouseStockMode = "LEGACY" | "MANAGED";

export class ManagedWarehouseStockError extends Error {
  constructor(
    public readonly code:
      | "WAREHOUSE_REQUIRED"
      | "WAREHOUSE_NOT_FOUND"
      | "PRODUCT_NOT_FOUND"
      | "NEGATIVE_WAREHOUSE_STOCK"
      | "WAREHOUSE_NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "ManagedWarehouseStockError";
  }
}

export async function getWarehouseStockMode(workspaceId: string): Promise<WarehouseStockMode> {
  const rows = await db.$queryRaw<Array<{ mode: string | null }>>`
    SELECT "config"->>'warehouseStockMode' AS "mode"
    FROM "workspace_modules"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "moduleKey"='inventory'
      AND "enabled"=true
    LIMIT 1
  `;
  return rows[0]?.mode === "MANAGED" ? "MANAGED" : "LEGACY";
}

export async function getWarehouseStockModeInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<WarehouseStockMode> {
  const rows = await tx.$queryRaw<Array<{ mode: string | null }>>`
    SELECT "config"->>'warehouseStockMode' AS "mode"
    FROM "workspace_modules"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "moduleKey"='inventory'
      AND "enabled"=true
    LIMIT 1
  `;
  return rows[0]?.mode === "MANAGED" ? "MANAGED" : "LEGACY";
}

export async function getManagedWarehouseReadiness(workspaceId: string) {
  const reconciliation = await getWarehouseReconciliation(workspaceId);
  const reasons: string[] = [];

  if (reconciliation.warehouseCount < 1) reasons.push("Create at least one active warehouse.");
  if (!reconciliation.defaultWarehouseId) reasons.push("Choose one active default warehouse.");
  if (!reconciliation.isReconciled) reasons.push("Reconcile warehouse balances with core inventory.");

  return {
    ready: reasons.length === 0,
    reasons,
    reconciliation,
  };
}

export async function applyManagedWarehouseStockDelta(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    warehouseId?: string | null;
    productId: string;
    delta: number | Prisma.Decimal;
  },
): Promise<
  | { applied: false; mode: "LEGACY" }
  | { applied: true; mode: "MANAGED"; warehouseId: string; previousQuantity: number; nextQuantity: number }
> {
  const mode = await getWarehouseStockModeInTransaction(tx, input.workspaceId);
  if (mode === "LEGACY") return { applied: false, mode };

  if (!input.warehouseId) {
    throw new ManagedWarehouseStockError(
      "WAREHOUSE_REQUIRED",
      "A warehouse is required while managed warehouse stock is enabled.",
    );
  }

  const delta = new Prisma.Decimal(input.delta);
  if (!delta.isFinite()) {
    throw new ManagedWarehouseStockError("WAREHOUSE_NOT_READY", "Warehouse stock change must be a finite number.");
  }

  const warehouses = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "warehouses"
    WHERE "id"=${input.warehouseId}::uuid
      AND "workspaceId"=${input.workspaceId}::uuid
      AND "isActive"=true
    FOR SHARE
  `;
  if (!warehouses[0]) {
    throw new ManagedWarehouseStockError(
      "WAREHOUSE_NOT_FOUND",
      "The selected warehouse is not active in this workspace.",
    );
  }

  const products = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "products"
    WHERE "id"=${input.productId}
      AND "workspaceId"=${input.workspaceId}
    FOR SHARE
  `;
  if (!products[0]) {
    throw new ManagedWarehouseStockError(
      "PRODUCT_NOT_FOUND",
      "The selected product is not in this workspace.",
    );
  }

  const balances = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
    SELECT "quantity"
    FROM "warehouse_stocks"
    WHERE "workspaceId"=${input.workspaceId}::uuid
      AND "warehouseId"=${input.warehouseId}::uuid
      AND "productId"=${input.productId}::uuid
    FOR UPDATE
  `;
  const previous = balances[0]?.quantity ?? new Prisma.Decimal(0);
  const next = previous.add(delta);

  if (next.lt(0)) {
    throw new ManagedWarehouseStockError(
      "NEGATIVE_WAREHOUSE_STOCK",
      "Warehouse stock cannot go below zero.",
    );
  }

  await tx.$executeRaw`
    INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity", "updatedAt")
    VALUES (${input.workspaceId}::uuid, ${input.warehouseId}::uuid, ${input.productId}::uuid, ${next}, now())
    ON CONFLICT ("warehouseId", "productId")
    DO UPDATE SET "quantity"=EXCLUDED."quantity", "updatedAt"=now()
  `;

  return {
    applied: true,
    mode,
    warehouseId: input.warehouseId,
    previousQuantity: previous.toNumber(),
    nextQuantity: next.toNumber(),
  };
}
