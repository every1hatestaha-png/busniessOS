import { Prisma } from "@prisma/client";

import { db } from "@/lib/server/db";

export class WarehouseReconciliationError extends Error {
  constructor(
    public readonly code:
      | "DEFAULT_WAREHOUSE_REQUIRED"
      | "WAREHOUSE_STOCK_ALREADY_INITIALIZED"
      | "WAREHOUSE_STOCK_DRIFT",
    message: string,
  ) {
    super(message);
    this.name = "WarehouseReconciliationError";
  }
}

export type WarehouseProductReconciliation = {
  productId: string;
  productName: string;
  coreQuantity: number;
  warehouseQuantity: number;
  difference: number;
};

export type WarehouseReconciliation = {
  warehouseCount: number;
  defaultWarehouseId: string | null;
  warehouseStockRows: number;
  products: WarehouseProductReconciliation[];
  drift: WarehouseProductReconciliation[];
  isReconciled: boolean;
};

export async function getWarehouseReconciliation(workspaceId: string): Promise<WarehouseReconciliation> {
  const [warehouseMeta, rows] = await Promise.all([
    db.$queryRaw<Array<{
      warehouseCount: bigint;
      warehouseStockRows: bigint;
      defaultWarehouseId: string | null;
    }>>`
      SELECT
        (SELECT count(*)::bigint FROM "warehouses" WHERE "workspaceId"=${workspaceId}::uuid AND "isActive"=true) AS "warehouseCount",
        (SELECT count(*)::bigint FROM "warehouse_stocks" WHERE "workspaceId"=${workspaceId}::uuid) AS "warehouseStockRows",
        (
          SELECT "id"::text
          FROM "warehouses"
          WHERE "workspaceId"=${workspaceId}::uuid AND "isActive"=true AND "isDefault"=true
          LIMIT 1
        ) AS "defaultWarehouseId"
    `,
    db.$queryRaw<Array<{
      productId: string;
      productName: string;
      coreQuantity: Prisma.Decimal;
      warehouseQuantity: Prisma.Decimal;
    }>>`
      SELECT
        p."id" AS "productId",
        p."name" AS "productName",
        p."stockQuantity" AS "coreQuantity",
        coalesce(sum(ws."quantity"), 0)::numeric AS "warehouseQuantity"
      FROM "products" p
      LEFT JOIN "warehouse_stocks" ws
        ON ws."workspaceId"::text = p."workspaceId"
        AND ws."productId"::text = p."id"
      WHERE p."workspaceId"=${workspaceId}
      GROUP BY p."id", p."name", p."stockQuantity"
      ORDER BY p."name" ASC, p."id" ASC
    `,
  ]);

  const meta = warehouseMeta[0];
  const products = rows.map((row) => {
    const coreQuantity = Number(row.coreQuantity);
    const warehouseQuantity = Number(row.warehouseQuantity);
    return {
      productId: row.productId,
      productName: row.productName,
      coreQuantity,
      warehouseQuantity,
      difference: warehouseQuantity - coreQuantity,
    };
  });
  const drift = products.filter((row) => Math.abs(row.difference) > 0.000001);

  return {
    warehouseCount: Number(meta?.warehouseCount ?? 0),
    defaultWarehouseId: meta?.defaultWarehouseId ?? null,
    warehouseStockRows: Number(meta?.warehouseStockRows ?? 0),
    products,
    drift,
    isReconciled: drift.length === 0,
  };
}

export async function assertWarehouseReconciled(workspaceId: string) {
  const reconciliation = await getWarehouseReconciliation(workspaceId);
  if (!reconciliation.isReconciled) {
    throw new WarehouseReconciliationError(
      "WAREHOUSE_STOCK_DRIFT",
      `Warehouse stock differs from core inventory for ${reconciliation.drift.length} product(s).`,
    );
  }
  return reconciliation;
}

export async function bootstrapDefaultWarehouseFromCoreStock(workspaceId: string) {
  return db.$transaction(async (tx) => {
    const defaults = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id"
      FROM "warehouses"
      WHERE "workspaceId"=${workspaceId}::uuid
        AND "isActive"=true
        AND "isDefault"=true
      FOR UPDATE
    `;
    if (defaults.length !== 1) {
      throw new WarehouseReconciliationError(
        "DEFAULT_WAREHOUSE_REQUIRED",
        "Exactly one active default warehouse is required before warehouse stock can be initialized.",
      );
    }

    const existing = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS "count"
      FROM "warehouse_stocks"
      WHERE "workspaceId"=${workspaceId}::uuid
    `;
    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new WarehouseReconciliationError(
        "WAREHOUSE_STOCK_ALREADY_INITIALIZED",
        "Warehouse stock already contains location balances. Automatic bootstrap is disabled to avoid overwriting distribution data.",
      );
    }

    await tx.$queryRaw`
      SELECT "id"
      FROM "products"
      WHERE "workspaceId"=${workspaceId}
      FOR SHARE
    `;

    const inserted = await tx.$executeRaw`
      INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      SELECT
        ${workspaceId}::uuid,
        ${defaults[0]!.id}::uuid,
        p."id"::uuid,
        p."stockQuantity"
      FROM "products" p
      WHERE p."workspaceId"=${workspaceId}
        AND p."stockQuantity" <> 0
    `;

    return {
      warehouseId: defaults[0]!.id,
      insertedRows: inserted,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
