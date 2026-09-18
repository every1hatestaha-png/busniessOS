import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";
import { applyManagedWarehouseStockDelta, getWarehouseStockModeInTransaction, ManagedWarehouseStockError } from "@/lib/server/managed-warehouse-stock";
import {
  canTransitionKitchenTicket,
  canTransitionProductionRun,
  canTransitionServiceJob,
  canTransitionServiceQuote,
  type KitchenTicketStatus,
  type ProductionRunStatus,
  type ServiceJobStatus,
  type ServiceQuoteStatus,
} from "@/lib/domain/industry-lifecycles";

export type IndustryModuleKey = "inventory" | "restaurant" | "wholesale" | "manufacturing" | "accounting" | "multiBranch" | "payroll" | "integrations" | "services";
export type IndustryContext = { workspaceId: string; role: Role; userId?: string };

type JsonConfig = Record<string, unknown>;

export class IndustryDomainError extends Error {
  constructor(
    public readonly code:
      | "PERMISSION_DENIED"
      | "MODULE_DISABLED"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "INSUFFICIENT_STOCK"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

function assertManager(context: IndustryContext) {
  if (!(["OWNER", "ADMIN", "MANAGER"] as Role[]).includes(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for this action.");
  }
}

async function resolveIndustryWarehouseId(tx: Prisma.TransactionClient, workspaceId: string) {
  const mode = await getWarehouseStockModeInTransaction(tx, workspaceId);
  if (mode === "LEGACY") return undefined;

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "warehouses"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "isActive"=true
      AND "isDefault"=true
    FOR SHARE
  `;
  if (rows.length !== 1) {
    throw new IndustryDomainError(
      "INVALID_STATE",
      "Managed warehouse stock requires exactly one active default warehouse for restaurant and production inventory.",
    );
  }
  return rows[0]!.id;
}

async function applyIndustryWarehouseDelta(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; warehouseId?: string; productId: string; delta: number },
) {
  try {
    return await applyManagedWarehouseStockDelta(tx, input);
  } catch (error) {
    if (error instanceof ManagedWarehouseStockError) {
      const code = error.code === "NEGATIVE_WAREHOUSE_STOCK" ? "INSUFFICIENT_STOCK" : "INVALID_STATE";
      throw new IndustryDomainError(code, error.message);
    }
    throw error;
  }
}

export async function listWorkspaceModules(workspaceId: string) {
  return db.$queryRaw<Array<{ moduleKey: IndustryModuleKey; enabled: boolean; config: JsonConfig }>>`
    SELECT "moduleKey", "enabled", "config"
    FROM "workspace_modules"
    WHERE "workspaceId" = ${workspaceId}::uuid
    ORDER BY "moduleKey" ASC
  `;
}

export async function setWorkspaceModule(context: IndustryContext, moduleKey: IndustryModuleKey, enabled: boolean, config: JsonConfig = {}) {
  assertManager(context);
  const rows = await db.$queryRaw<Array<{ moduleKey: IndustryModuleKey; enabled: boolean; config: JsonConfig }>>`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${context.workspaceId}::uuid, ${moduleKey}, ${enabled}, ${JSON.stringify(config)}::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey")
    DO UPDATE SET "enabled" = EXCLUDED."enabled", "config" = EXCLUDED."config", "updatedAt" = now()
    RETURNING "moduleKey", "enabled", "config"
  `;
  return rows[0]!;
}

export async function requireWorkspaceModule(workspaceId: string, moduleKey: IndustryModuleKey) {
  const rows = await db.$queryRaw<Array<{ enabled: boolean }>>`
    SELECT "enabled" FROM "workspace_modules"
    WHERE "workspaceId" = ${workspaceId}::uuid AND "moduleKey" = ${moduleKey}
    LIMIT 1
  `;
  if (!rows[0]?.enabled) throw new IndustryDomainError("MODULE_DISABLED", `${moduleKey} is not enabled for this workspace.`);
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryModuleKey[]> = {
  RETAIL: ["inventory"],
  RESTAURANT: ["inventory", "restaurant"],
  WHOLESALE: ["inventory", "wholesale", "accounting"],
  MANUFACTURING: ["inventory", "wholesale", "manufacturing", "accounting"],
  SERVICES: ["services", "accounting"],
};

export async function applyIndustryTemplate(context: IndustryContext, template: keyof typeof INDUSTRY_TEMPLATES) {
  assertManager(context);
  const enabled = new Set(INDUSTRY_TEMPLATES[template]);
  const known = ["inventory", "restaurant", "wholesale", "manufacturing", "accounting", "multiBranch", "payroll", "integrations", "services"] as IndustryModuleKey[];
  await db.$transaction(
    known.map((moduleKey) =>
      db.$executeRaw`
        INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
        VALUES (${context.workspaceId}::uuid, ${moduleKey}, ${enabled.has(moduleKey)}, '{}'::jsonb, now())
        ON CONFLICT ("workspaceId", "moduleKey")
        DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()
      `,
    ),
  );
  return listWorkspaceModules(context.workspaceId);
}

// ---------------- Restaurant ----------------

export async function listRestaurantTables(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  return db.$queryRaw<Array<{ id: string; name: string; capacity: number; area: string | null; status: string }>>`
    SELECT "id", "name", "capacity", "area", "status"
    FROM "restaurant_tables"
    WHERE "workspaceId" = ${workspaceId}::uuid
    ORDER BY "area" NULLS LAST, "name"
  `;
}

export async function createRestaurantTable(context: IndustryContext, input: { name: string; capacity?: number; area?: string }) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const name = input.name.trim();
  const capacity = input.capacity ?? 2;
  if (!name || capacity <= 0) throw new IndustryDomainError("INVALID_STATE", "A table name and positive capacity are required.");
  const rows = await db.$queryRaw<Array<{ id: string; name: string; capacity: number; area: string | null; status: string }>>`
    INSERT INTO "restaurant_tables" ("workspaceId", "name", "capacity", "area")
    VALUES (${context.workspaceId}::uuid, ${name}, ${capacity}, ${input.area?.trim() || null})
    RETURNING "id", "name", "capacity", "area", "status"
  `;
  return rows[0]!;
}

export async function createRecipe(context: IndustryContext, input: { finishedProductId: string; yieldQuantity?: number; notes?: string; items: Array<{ ingredientProductId: string; quantity: number; wastagePercent?: number }> }) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (!input.items.length) throw new IndustryDomainError("INVALID_STATE", "A recipe needs at least one ingredient.");
  const yieldQuantity = input.yieldQuantity ?? 1;
  if (yieldQuantity <= 0) throw new IndustryDomainError("INVALID_STATE", "Recipe yield must be positive.");

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: [input.finishedProductId, ...input.items.map((item) => item.ingredientProductId)] } },
      select: { id: true },
    });
    if (products.length !== new Set([input.finishedProductId, ...input.items.map((item) => item.ingredientProductId)]).size) {
      throw new IndustryDomainError("NOT_FOUND", "One or more recipe products do not belong to this workspace.");
    }
    const [recipe] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "recipes" ("workspaceId", "finishedProductId", "yieldQuantity", "notes", "updatedAt")
      VALUES (${context.workspaceId}::uuid, ${input.finishedProductId}::uuid, ${yieldQuantity}, ${input.notes?.trim() || null}, now())
      ON CONFLICT ("workspaceId", "finishedProductId")
      DO UPDATE SET "yieldQuantity" = EXCLUDED."yieldQuantity", "notes" = EXCLUDED."notes", "isActive" = true, "updatedAt" = now()
      RETURNING "id"
    `;
    await tx.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId" = ${recipe!.id}::uuid`;
    for (const item of input.items) {
      if (item.quantity <= 0) throw new IndustryDomainError("INVALID_STATE", "Ingredient quantity must be positive.");
      const wastage = item.wastagePercent ?? 0;
      if (wastage < 0 || wastage > 100) throw new IndustryDomainError("INVALID_STATE", "Ingredient wastage must be between 0 and 100 percent.");
      await tx.$executeRaw`
        INSERT INTO "recipe_items" ("recipeId", "ingredientProductId", "quantity", "wastagePercent")
        VALUES (${recipe!.id}::uuid, ${item.ingredientProductId}::uuid, ${item.quantity}, ${wastage})
      `;
    }
    return recipe!;
  });
}

export async function createKitchenTicket(context: IndustryContext, input: { ticketNumber: string; salesOrderId?: string; restaurantTableId?: string; notes?: string }) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const ticketNumber = input.ticketNumber.trim();
  if (!ticketNumber) throw new IndustryDomainError("INVALID_STATE", "Ticket number is required.");

  if (input.salesOrderId) {
    const order = await db.salesOrder.findFirst({ where: { id: input.salesOrderId, workspaceId: context.workspaceId }, select: { id: true } });
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Sales order was not found in this workspace.");
  }

  if (input.restaurantTableId) {
    const tables = await db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status" FROM "restaurant_tables"
      WHERE "id"=${input.restaurantTableId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    const table = tables[0];
    if (!table) throw new IndustryDomainError("NOT_FOUND", "Restaurant table was not found in this workspace.");
    if (table.status === "INACTIVE") throw new IndustryDomainError("INVALID_STATE", "Inactive restaurant tables cannot receive kitchen tickets.");
  }

  const rows = await db.$queryRaw<Array<{ id: string; ticketNumber: string; status: string }>>`
    INSERT INTO "kitchen_tickets" ("workspaceId", "salesOrderId", "restaurantTableId", "ticketNumber", "notes")
    VALUES (${context.workspaceId}::uuid, ${input.salesOrderId ?? null}::uuid, ${input.restaurantTableId ?? null}::uuid, ${ticketNumber}, ${input.notes?.trim() || null})
    RETURNING "id", "ticketNumber", "status"
  `;
  if (input.restaurantTableId) {
    await db.$executeRaw`
      UPDATE "restaurant_tables" SET "status"='OCCUPIED', "updatedAt"=now()
      WHERE "id"=${input.restaurantTableId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
  }
  return rows[0]!;
}

async function consumeTicketRecipes(tx: Prisma.TransactionClient, workspaceId: string, ticketId: string, salesOrderId: string) {
  const existing = await tx.inventoryTransaction.findFirst({ where: { workspaceId, reference: `KITCHEN:${ticketId}` }, select: { id: true } });
  if (existing) return;

  const warehouseId = await resolveIndustryWarehouseId(tx, workspaceId);
  const lines = await tx.salesOrderItem.findMany({ where: { salesOrderId }, select: { productId: true, quantity: true } });
  for (const line of lines) {
    const recipes = await tx.$queryRaw<Array<{ id: string; yieldQuantity: Prisma.Decimal }>>`
      SELECT "id", "yieldQuantity" FROM "recipes"
      WHERE "workspaceId"=${workspaceId}::uuid AND "finishedProductId"=${line.productId}::uuid AND "isActive"=true
      LIMIT 1
    `;
    const recipe = recipes[0];
    if (!recipe) continue;
    const items = await tx.$queryRaw<Array<{ ingredientProductId: string; quantity: Prisma.Decimal; wastagePercent: Prisma.Decimal }>>`
      SELECT "ingredientProductId", "quantity", "wastagePercent" FROM "recipe_items" WHERE "recipeId"=${recipe.id}::uuid
    `;
    const factor = Number(line.quantity) / Number(recipe.yieldQuantity);
    for (const item of items) {
      const required = Number(item.quantity) * factor * (1 + Number(item.wastagePercent) / 100);
      const ingredient = await tx.product.findFirst({ where: { id: item.ingredientProductId, workspaceId }, select: { id: true, stockQuantity: true, costPrice: true } });
      if (!ingredient) throw new IndustryDomainError("NOT_FOUND", "Recipe ingredient no longer exists.");
      if (Number(ingredient.stockQuantity) < required) throw new IndustryDomainError("INSUFFICIENT_STOCK", "Not enough ingredient stock to serve this order.");
      await tx.product.update({ where: { id: ingredient.id }, data: { stockQuantity: { decrement: required } } });
      await applyIndustryWarehouseDelta(tx, { workspaceId, warehouseId, productId: ingredient.id, delta: -required });
      await tx.inventoryTransaction.create({ data: { workspaceId, productId: ingredient.id, type: "ADJUSTMENT", quantityChanged: -required, unitCost: ingredient.costPrice, reference: `KITCHEN:${ticketId}` } });
    }
  }
}

export async function updateKitchenTicketStatus(context: IndustryContext, ticketId: string, status: KitchenTicketStatus) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; salesOrderId: string | null; restaurantTableId: string | null }>>`
      SELECT "id", "status", "salesOrderId", "restaurantTableId" FROM "kitchen_tickets"
      WHERE "id"=${ticketId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new IndustryDomainError("NOT_FOUND", "Kitchen ticket was not found.");
    if (current.status === status) return { id: ticketId, status };

    if (!canTransitionKitchenTicket(current.status as KitchenTicketStatus, status)) {
      throw new IndustryDomainError("INVALID_STATE", `Kitchen ticket cannot move from ${current.status} to ${status}.`);
    }

    if (status === "SERVED" && current.salesOrderId) await consumeTicketRecipes(tx, context.workspaceId, ticketId, current.salesOrderId);
    await tx.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "status"=${status},
          "startedAt"=CASE WHEN ${status}='PREPARING' AND "startedAt" IS NULL THEN now() ELSE "startedAt" END,
          "readyAt"=CASE WHEN ${status}='READY' AND "readyAt" IS NULL THEN now() ELSE "readyAt" END,
          "servedAt"=CASE WHEN ${status}='SERVED' AND "servedAt" IS NULL THEN now() ELSE "servedAt" END,
          "updatedAt"=now()
      WHERE "id"=${ticketId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    if ((status === "SERVED" || status === "CANCELLED") && current.restaurantTableId) {
      await tx.$executeRaw`UPDATE "restaurant_tables" SET "status"='AVAILABLE', "updatedAt"=now() WHERE "id"=${current.restaurantTableId}::uuid AND "workspaceId"=${context.workspaceId}::uuid`;
    }
    return { id: ticketId, status };
  });
}

export async function openCashShift(context: IndustryContext, openingCash = 0, notes?: string) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (openingCash < 0) throw new IndustryDomainError("INVALID_STATE", "Opening cash cannot be negative.");
  const rows = await db.$queryRaw<Array<{ id: string; openedAt: Date; openingCash: Prisma.Decimal }>>`
    INSERT INTO "cash_shifts" ("workspaceId", "openedById", "openingCash", "notes")
    VALUES (${context.workspaceId}::uuid, ${context.userId ?? null}::uuid, ${openingCash}, ${notes?.trim() || null})
    RETURNING "id", "openedAt", "openingCash"
  `;
  return rows[0]!;
}

export async function closeCashShift(context: IndustryContext, shiftId: string, closingCash: number, notes?: string) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (closingCash < 0) throw new IndustryDomainError("INVALID_STATE", "Closing cash cannot be negative.");
  return db.$transaction(async (tx) => {
    const shifts = await tx.$queryRaw<Array<{ id: string; openedAt: Date; openingCash: Prisma.Decimal; status: string }>>`
      SELECT "id", "openedAt", "openingCash", "status" FROM "cash_shifts"
      WHERE "id"=${shiftId}::uuid AND "workspaceId"=${context.workspaceId}::uuid FOR UPDATE
    `;
    const shift = shifts[0];
    if (!shift) throw new IndustryDomainError("NOT_FOUND", "Cash shift was not found.");
    if (shift.status !== "OPEN") throw new IndustryDomainError("INVALID_STATE", "Cash shift is already closed.");
    const receipts = await tx.payment.aggregate({
      where: { workspaceId: context.workspaceId, paymentDate: { gte: shift.openedAt }, customerId: { not: null }, isReversed: false, method: "CASH" },
      _sum: { netAmount: true, amount: true },
    });
    const supplierCash = await tx.payment.aggregate({
      where: { workspaceId: context.workspaceId, paymentDate: { gte: shift.openedAt }, supplierId: { not: null }, isReversed: false, method: "CASH" },
      _sum: { netAmount: true, amount: true },
    });
    const expectedCash = Number(shift.openingCash) + Number(receipts._sum.netAmount ?? receipts._sum.amount ?? 0) - Number(supplierCash._sum.netAmount ?? supplierCash._sum.amount ?? 0);
    const variance = closingCash - expectedCash;
    await tx.$executeRaw`
      UPDATE "cash_shifts" SET "status"='CLOSED', "closedAt"=now(), "closedById"=${context.userId ?? null}::uuid,
        "expectedCash"=${expectedCash}, "closingCash"=${closingCash}, "variance"=${variance}, "notes"=COALESCE(${notes?.trim() || null}, "notes")
      WHERE "id"=${shiftId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    return { id: shiftId, expectedCash, closingCash, variance };
  });
}

// ---------------- Warehouses / Manufacturing ----------------

export async function createWarehouse(context: IndustryContext, input: { name: string; code: string; address?: string; isDefault?: boolean }) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "inventory");
  return db.$transaction(async (tx) => {
    if (input.isDefault) await tx.$executeRaw`UPDATE "warehouses" SET "isDefault"=false, "updatedAt"=now() WHERE "workspaceId"=${context.workspaceId}::uuid`;
    const rows = await tx.$queryRaw<Array<{ id: string; name: string; code: string; isDefault: boolean }>>`
      INSERT INTO "warehouses" ("workspaceId", "name", "code", "address", "isDefault")
      VALUES (${context.workspaceId}::uuid, ${input.name.trim()}, ${input.code.trim().toUpperCase()}, ${input.address?.trim() || null}, ${Boolean(input.isDefault)})
      RETURNING "id", "name", "code", "isDefault"
    `;
    return rows[0]!;
  });
}

export async function transferWarehouseStock(context: IndustryContext, input: { productId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number }) {
  await requireWorkspaceModule(context.workspaceId, "inventory");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.fromWarehouseId === input.toWarehouseId) {
    throw new IndustryDomainError("INVALID_STATE", "A positive quantity and two different warehouses are required.");
  }
  return db.$transaction(async (tx) => {
    const mode = await getWarehouseStockModeInTransaction(tx, context.workspaceId);
    if (mode !== "MANAGED") {
      throw new IndustryDomainError("INVALID_STATE", "Warehouse transfers require managed warehouse stock.");
    }

    const product = await tx.$queryRaw<Array<{ id: string; name: string; sku: string | null; stockQuantity: Prisma.Decimal }>>`
      SELECT "id"::text AS "id", "name", "sku", "stockQuantity"
      FROM "products"
      WHERE "id"=${input.productId}::uuid AND "workspaceId"=${context.workspaceId}
      FOR UPDATE
    `;
    if (!product[0]) throw new IndustryDomainError("NOT_FOUND", "Product was not found in this workspace.");

    const warehouses = await tx.$queryRaw<Array<{ id: string; name: string; code: string }>>`
      SELECT "id"::text AS "id", "name", "code"
      FROM "warehouses"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "id" IN (${input.fromWarehouseId}::uuid, ${input.toWarehouseId}::uuid)
        AND "isActive"=true
      FOR SHARE
    `;
    if (warehouses.length !== 2) throw new IndustryDomainError("NOT_FOUND", "Warehouse was not found in this workspace.");

    const totals = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
      SELECT coalesce(sum("quantity"), 0)::numeric AS "quantity"
      FROM "warehouse_stocks"
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "productId"=${input.productId}::uuid
    `;
    const warehouseTotal = new Prisma.Decimal(totals[0]?.quantity ?? 0);
    if (!warehouseTotal.equals(product[0]!.stockQuantity)) {
      throw new IndustryDomainError("CONFLICT", "Warehouse stock is out of sync with core inventory. Reconcile stock before transferring.");
    }

    const source = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
      SELECT "quantity"
      FROM "warehouse_stocks"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "warehouseId"=${input.fromWarehouseId}::uuid
        AND "productId"=${input.productId}::uuid
      FOR UPDATE
    `;
    if (new Prisma.Decimal(source[0]?.quantity ?? 0).lt(input.quantity)) {
      throw new IndustryDomainError("INSUFFICIENT_STOCK", "Not enough stock in the source warehouse.");
    }

    await tx.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "quantity"="quantity"-${input.quantity}, "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "warehouseId"=${input.fromWarehouseId}::uuid
        AND "productId"=${input.productId}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      VALUES (${context.workspaceId}::uuid, ${input.toWarehouseId}::uuid, ${input.productId}::uuid, ${input.quantity})
      ON CONFLICT ("warehouseId", "productId")
      DO UPDATE SET "quantity"="warehouse_stocks"."quantity"+EXCLUDED."quantity", "updatedAt"=now()
    `;

    const sourceWarehouse = warehouses.find((warehouse) => warehouse.id === input.fromWarehouseId)!;
    const destinationWarehouse = warehouses.find((warehouse) => warehouse.id === input.toWarehouseId)!;
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "warehouse.stock.transferred",
      entityType: "Product",
      entityId: input.productId,
      metadata: {
        productId: input.productId,
        productName: product[0]!.name,
        sku: product[0]!.sku,
        fromWarehouseId: sourceWarehouse.id,
        fromWarehouseName: sourceWarehouse.name,
        fromWarehouseCode: sourceWarehouse.code,
        toWarehouseId: destinationWarehouse.id,
        toWarehouseName: destinationWarehouse.name,
        toWarehouseCode: destinationWarehouse.code,
        quantity: input.quantity,
      },
    });

    return { ...input };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createBom(context: IndustryContext, input: { name: string; finishedProductId: string; outputQuantity?: number; version?: number; notes?: string; items: Array<{ materialProductId: string; quantity: number; wastagePercent?: number }> }) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "manufacturing");
  if (!input.items.length) throw new IndustryDomainError("INVALID_STATE", "A BOM needs at least one material.");
  const outputQuantity = input.outputQuantity ?? 1;
  const version = input.version ?? 1;
  return db.$transaction(async (tx) => {
    const ids = [input.finishedProductId, ...input.items.map((item) => item.materialProductId)];
    const products = await tx.product.count({ where: { workspaceId: context.workspaceId, id: { in: ids } } });
    if (products !== new Set(ids).size) throw new IndustryDomainError("NOT_FOUND", "One or more BOM products do not belong to this workspace.");
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "boms" ("workspaceId", "finishedProductId", "name", "version", "outputQuantity", "notes")
      VALUES (${context.workspaceId}::uuid, ${input.finishedProductId}::uuid, ${input.name.trim()}, ${version}, ${outputQuantity}, ${input.notes?.trim() || null})
      RETURNING "id"
    `;
    const bom = rows[0]!;
    for (const item of input.items) {
      if (item.quantity <= 0) throw new IndustryDomainError("INVALID_STATE", "BOM material quantity must be positive.");
      const wastage = item.wastagePercent ?? 0;
      await tx.$executeRaw`INSERT INTO "bom_items" ("bomId", "materialProductId", "quantity", "wastagePercent") VALUES (${bom.id}::uuid, ${item.materialProductId}::uuid, ${item.quantity}, ${wastage})`;
    }
    return bom;
  });
}

export async function createProductionRun(context: IndustryContext, input: { bomId: string; runNumber: string; plannedOutput: number; notes?: string }) {
  await requireWorkspaceModule(context.workspaceId, "manufacturing");
  if (input.plannedOutput <= 0) throw new IndustryDomainError("INVALID_STATE", "Planned output must be positive.");
  const bom = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "boms" WHERE "id"=${input.bomId}::uuid AND "workspaceId"=${context.workspaceId}::uuid AND "isActive"=true`;
  if (!bom[0]) throw new IndustryDomainError("NOT_FOUND", "BOM was not found.");
  const rows = await db.$queryRaw<Array<{ id: string; status: string }>>`
    INSERT INTO "production_runs" ("workspaceId", "bomId", "runNumber", "plannedOutput", "notes")
    VALUES (${context.workspaceId}::uuid, ${input.bomId}::uuid, ${input.runNumber.trim()}, ${input.plannedOutput}, ${input.notes?.trim() || null})
    RETURNING "id", "status"
  `;
  return rows[0]!;
}

export async function approveProductionRun(context: IndustryContext, productionRunId: string) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "manufacturing");
  const changed = await db.$executeRaw`
    UPDATE "production_runs" SET "status"='APPROVED', "approvedById"=${context.userId ?? null}::uuid, "approvedAt"=now(), "updatedAt"=now()
    WHERE "id"=${productionRunId}::uuid AND "workspaceId"=${context.workspaceId}::uuid AND "status"='DRAFT'
  `;
  if (!changed) throw new IndustryDomainError("INVALID_STATE", "Only draft production runs can be approved.");
  return { id: productionRunId, status: "APPROVED" as const };
}

export async function cancelProductionRun(context: IndustryContext, productionRunId: string) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "manufacturing");

  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: ProductionRunStatus }>>`
      SELECT "id", "status"
      FROM "production_runs"
      WHERE "id"=${productionRunId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const run = rows[0];
    if (!run) throw new IndustryDomainError("NOT_FOUND", "Production run was not found.");
    if (run.status === "CANCELLED") return { id: productionRunId, status: "CANCELLED" as const };
    if (!canTransitionProductionRun(run.status, "CANCELLED")) {
      throw new IndustryDomainError("INVALID_STATE", "Posted production runs cannot be cancelled. Use a controlled reversal workflow instead.");
    }

    await tx.$executeRaw`
      UPDATE "production_runs"
      SET "status"='CANCELLED', "updatedAt"=now()
      WHERE "id"=${productionRunId}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
        AND "status"=${run.status}
    `;
    return { id: productionRunId, status: "CANCELLED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postProductionRun(context: IndustryContext, productionRunId: string, actualOutput?: number, wastageQuantity = 0) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "manufacturing");
  return db.$transaction(async (tx) => {
    const warehouseId = await resolveIndustryWarehouseId(tx, context.workspaceId);
    const runs = await tx.$queryRaw<Array<{ id: string; status: string; plannedOutput: Prisma.Decimal; bomId: string }>>`
      SELECT "id", "status", "plannedOutput", "bomId" FROM "production_runs"
      WHERE "id"=${productionRunId}::uuid AND "workspaceId"=${context.workspaceId}::uuid FOR UPDATE
    `;
    const run = runs[0];
    if (!run) throw new IndustryDomainError("NOT_FOUND", "Production run was not found.");
    if (!canTransitionProductionRun(run.status as ProductionRunStatus, "POSTED")) throw new IndustryDomainError("INVALID_STATE", "Production run must be approved before posting.");
    const output = actualOutput ?? Number(run.plannedOutput);
    if (output <= 0 || wastageQuantity < 0) throw new IndustryDomainError("INVALID_STATE", "Actual output must be positive and wastage cannot be negative.");

    const boms = await tx.$queryRaw<Array<{ finishedProductId: string; outputQuantity: Prisma.Decimal }>>`
      SELECT "finishedProductId", "outputQuantity" FROM "boms" WHERE "id"=${run.bomId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    const bom = boms[0];
    if (!bom) throw new IndustryDomainError("NOT_FOUND", "BOM was not found.");
    const items = await tx.$queryRaw<Array<{ materialProductId: string; quantity: Prisma.Decimal; wastagePercent: Prisma.Decimal }>>`
      SELECT "materialProductId", "quantity", "wastagePercent" FROM "bom_items" WHERE "bomId"=${run.bomId}::uuid
    `;
    const factor = output / Number(bom.outputQuantity);
    let materialCost = 0;
    for (const item of items) {
      const planned = Number(item.quantity) * factor;
      const required = planned * (1 + Number(item.wastagePercent) / 100);
      const product = await tx.product.findFirst({ where: { id: item.materialProductId, workspaceId: context.workspaceId }, select: { id: true, stockQuantity: true, costPrice: true } });
      if (!product) throw new IndustryDomainError("NOT_FOUND", "A BOM material no longer exists.");
      if (Number(product.stockQuantity) < required) throw new IndustryDomainError("INSUFFICIENT_STOCK", `Insufficient stock for production material ${product.id}.`);
      await tx.product.update({ where: { id: product.id }, data: { stockQuantity: { decrement: required } } });
      await applyIndustryWarehouseDelta(tx, { workspaceId: context.workspaceId, warehouseId, productId: product.id, delta: -required });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: product.id, type: "ADJUSTMENT", quantityChanged: -required, unitCost: product.costPrice, reference: `PRODUCTION:${productionRunId}` } });
      await tx.$executeRaw`
        INSERT INTO "production_consumptions" ("productionRunId", "productId", "plannedQuantity", "actualQuantity", "unitCost")
        VALUES (${productionRunId}::uuid, ${product.id}::uuid, ${planned}, ${required}, ${Number(product.costPrice)})
      `;
      materialCost += required * Number(product.costPrice);
    }

    const finished = await tx.product.findFirst({ where: { id: bom.finishedProductId, workspaceId: context.workspaceId }, select: { id: true, stockQuantity: true, costPrice: true } });
    if (!finished) throw new IndustryDomainError("NOT_FOUND", "Finished product no longer exists.");
    const unitCost = materialCost / output;
    const oldQty = Number(finished.stockQuantity);
    const newQty = oldQty + output;
    const weightedCost = newQty > 0 ? ((oldQty * Number(finished.costPrice)) + materialCost) / newQty : unitCost;
    await tx.product.update({ where: { id: finished.id }, data: { stockQuantity: { increment: output }, costPrice: weightedCost } });
    await applyIndustryWarehouseDelta(tx, { workspaceId: context.workspaceId, warehouseId, productId: finished.id, delta: output });
    await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: finished.id, type: "ADJUSTMENT", quantityChanged: output, unitCost, reference: `PRODUCTION:${productionRunId}` } });
    await tx.$executeRaw`
      UPDATE "production_runs" SET "status"='POSTED', "actualOutput"=${output}, "wastageQuantity"=${wastageQuantity}, "postedById"=${context.userId ?? null}::uuid, "postedAt"=now(), "updatedAt"=now()
      WHERE "id"=${productionRunId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    return { id: productionRunId, status: "POSTED" as const, actualOutput: output, materialCost, unitCost };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// ---------------- Services ----------------

export async function createServiceQuote(context: IndustryContext, input: { customerId: string; quoteNumber: string; validUntil?: Date; discount?: number; tax?: number; notes?: string; items: Array<{ description: string; quantity?: number; unitPrice: number }> }) {
  await requireWorkspaceModule(context.workspaceId, "services");
  if (!input.items.length) throw new IndustryDomainError("INVALID_STATE", "A quotation needs at least one line.");
  const customer = await db.customer.findFirst({ where: { id: input.customerId, workspaceId: context.workspaceId }, select: { id: true } });
  if (!customer) throw new IndustryDomainError("NOT_FOUND", "Client was not found in this workspace.");
  const subtotal = input.items.reduce((sum, item) => sum + (item.quantity ?? 1) * item.unitPrice, 0);
  const discount = input.discount ?? 0;
  const tax = input.tax ?? 0;
  const total = subtotal - discount + tax;
  if (total < 0) throw new IndustryDomainError("INVALID_STATE", "Quotation total cannot be negative.");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; quoteNumber: string; total: Prisma.Decimal; status: string }>>`
      INSERT INTO "service_quotes" ("workspaceId", "customerId", "quoteNumber", "subtotal", "discount", "tax", "total", "validUntil", "notes")
      VALUES (${context.workspaceId}::uuid, ${input.customerId}::uuid, ${input.quoteNumber.trim()}, ${subtotal}, ${discount}, ${tax}, ${total}, ${input.validUntil ?? null}, ${input.notes?.trim() || null})
      RETURNING "id", "quoteNumber", "total", "status"
    `;
    for (const [index, item] of input.items.entries()) {
      const description = item.description.trim();
      const quantity = item.quantity ?? 1;
      if (!description) throw new IndustryDomainError("INVALID_STATE", "Every quotation line needs a description.");
      if (quantity <= 0 || item.unitPrice < 0) throw new IndustryDomainError("INVALID_STATE", "Quotation quantity must be positive and price cannot be negative.");
      await tx.$executeRaw`
        INSERT INTO "service_quote_items" ("serviceQuoteId", "description", "quantity", "unitPrice", "lineTotal", "position")
        VALUES (${rows[0]!.id}::uuid, ${description}, ${quantity}, ${item.unitPrice}, ${quantity * item.unitPrice}, ${index + 1})
      `;
    }
    return { ...rows[0]!, total: Number(rows[0]!.total) };
  });
}

export async function setServiceQuoteStatus(context: IndustryContext, quoteId: string, status: ServiceQuoteStatus) {
  await requireWorkspaceModule(context.workspaceId, "services");
  const rows = await db.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "service_quotes"
    WHERE "id"=${quoteId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
  `;
  const current = rows[0];
  if (!current) throw new IndustryDomainError("NOT_FOUND", "Quotation was not found.");
  if (current.status === status) return { id: quoteId, status };

  if (!canTransitionServiceQuote(current.status as ServiceQuoteStatus, status)) {
    throw new IndustryDomainError("INVALID_STATE", `Quotation cannot move from ${current.status} to ${status}.`);
  }

  await db.$executeRaw`UPDATE "service_quotes" SET "status"=${status}, "updatedAt"=now() WHERE "id"=${quoteId}::uuid AND "workspaceId"=${context.workspaceId}::uuid`;
  return { id: quoteId, status };
}

export async function createServiceJob(context: IndustryContext, input: { customerId: string; serviceQuoteId?: string; jobNumber: string; title: string; description?: string; assignedToId?: string; scheduledAt?: Date }) {
  await requireWorkspaceModule(context.workspaceId, "services");
  const customer = await db.customer.findFirst({ where: { id: input.customerId, workspaceId: context.workspaceId }, select: { id: true } });
  if (!customer) throw new IndustryDomainError("NOT_FOUND", "Client was not found in this workspace.");

  const jobNumber = input.jobNumber.trim();
  const title = input.title.trim();
  if (!jobNumber || !title) throw new IndustryDomainError("INVALID_STATE", "Job number and title are required.");

  return db.$transaction(async (tx) => {
    if (input.serviceQuoteId) {
      const quotes = await tx.$queryRaw<Array<{ id: string; status: ServiceQuoteStatus }>>`
        SELECT "id", "status" FROM "service_quotes"
        WHERE "id"=${input.serviceQuoteId}::uuid
          AND "workspaceId"=${context.workspaceId}::uuid
          AND "customerId"=${input.customerId}::uuid
        FOR UPDATE
      `;
      const quote = quotes[0];
      if (!quote) throw new IndustryDomainError("NOT_FOUND", "Quotation was not found for this client in this workspace.");
      if (!canTransitionServiceQuote(quote.status, "CONVERTED")) {
        throw new IndustryDomainError("INVALID_STATE", "Only an accepted quotation can be converted into a service job.");
      }
    }

    const rows = await tx.$queryRaw<Array<{ id: string; jobNumber: string; status: string }>>`
      INSERT INTO "service_jobs" ("workspaceId", "customerId", "serviceQuoteId", "jobNumber", "title", "description", "assignedToId", "scheduledAt")
      VALUES (${context.workspaceId}::uuid, ${input.customerId}::uuid, ${input.serviceQuoteId ?? null}::uuid, ${jobNumber}, ${title}, ${input.description?.trim() || null}, ${input.assignedToId ?? null}::uuid, ${input.scheduledAt ?? null})
      RETURNING "id", "jobNumber", "status"
    `;

    if (input.serviceQuoteId) {
      const changed = await tx.$executeRaw`
        UPDATE "service_quotes"
        SET "status"='CONVERTED', "updatedAt"=now()
        WHERE "id"=${input.serviceQuoteId}::uuid
          AND "workspaceId"=${context.workspaceId}::uuid
          AND "customerId"=${input.customerId}::uuid
          AND "status"='ACCEPTED'
      `;
      if (changed !== 1) {
        throw new IndustryDomainError("INVALID_STATE", "Quotation changed before conversion. Refresh and try again.");
      }
    }

    return rows[0]!;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateServiceJobStatus(context: IndustryContext, jobId: string, status: ServiceJobStatus) {
  await requireWorkspaceModule(context.workspaceId, "services");
  const rows = await db.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "service_jobs"
    WHERE "id"=${jobId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
  `;
  const current = rows[0];
  if (!current) throw new IndustryDomainError("NOT_FOUND", "Service job was not found.");
  if (current.status === status) return { id: jobId, status };

  if (!canTransitionServiceJob(current.status as ServiceJobStatus, status)) {
    throw new IndustryDomainError("INVALID_STATE", `Service job cannot move from ${current.status} to ${status}.`);
  }

  await db.$executeRaw`
    UPDATE "service_jobs"
    SET "status"=${status},
        "completedAt"=CASE WHEN ${status}='COMPLETED' THEN COALESCE("completedAt", now()) ELSE "completedAt" END,
        "updatedAt"=now()
    WHERE "id"=${jobId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
  `;
  return { id: jobId, status };
}

export async function listRestaurantRecipes(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const rows = await db.$queryRaw<Array<{
    id: string;
    productName: string | null;
    yieldQuantity: Prisma.Decimal;
    ingredientCount: bigint;
    isActive: boolean;
  }>>`
    SELECT r."id", p."name" AS "productName", r."yieldQuantity", r."isActive",
           count(ri."id")::bigint AS "ingredientCount"
    FROM "recipes" r
    LEFT JOIN "products" p ON p."id" = r."finishedProductId"::text AND p."workspaceId" = r."workspaceId"::text
    LEFT JOIN "recipe_items" ri ON ri."recipeId" = r."id"
    WHERE r."workspaceId" = ${workspaceId}::uuid
    GROUP BY r."id", p."name"
    ORDER BY r."updatedAt" DESC
  `;
  return rows.map((row) => ({
    ...row,
    yieldQuantity: Number(row.yieldQuantity),
    ingredientCount: Number(row.ingredientCount),
  }));
}

export async function listKitchenTickets(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  return db.$queryRaw<Array<{
    id: string;
    ticketNumber: string;
    status: string;
    tableName: string | null;
    salesOrderId: string | null;
    createdAt: Date;
  }>>`
    SELECT kt."id", kt."ticketNumber", kt."status", rt."name" AS "tableName",
           kt."salesOrderId", kt."createdAt"
    FROM "kitchen_tickets" kt
    LEFT JOIN "restaurant_tables" rt ON rt."id" = kt."restaurantTableId"
    WHERE kt."workspaceId" = ${workspaceId}::uuid
    ORDER BY kt."createdAt" DESC
    LIMIT 50
  `;
}

export async function listCashShifts(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const rows = await db.$queryRaw<Array<{
    id: string;
    status: string;
    openingCash: Prisma.Decimal;
    expectedCash: Prisma.Decimal | null;
    closingCash: Prisma.Decimal | null;
    variance: Prisma.Decimal | null;
    openedAt: Date;
    closedAt: Date | null;
  }>>`
    SELECT "id", "status", "openingCash", "expectedCash", "closingCash", "variance", "openedAt", "closedAt"
    FROM "cash_shifts"
    WHERE "workspaceId" = ${workspaceId}::uuid
    ORDER BY "openedAt" DESC
    LIMIT 30
  `;
  return rows.map((row) => ({
    ...row,
    openingCash: Number(row.openingCash),
    expectedCash: row.expectedCash === null ? null : Number(row.expectedCash),
    closingCash: row.closingCash === null ? null : Number(row.closingCash),
    variance: row.variance === null ? null : Number(row.variance),
  }));
}

export async function listWarehouses(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "inventory");
  return db.$queryRaw<Array<{
    id: string;
    name: string;
    code: string;
    address: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>>`
    SELECT "id", "name", "code", "address", "isDefault", "isActive"
    FROM "warehouses"
    WHERE "workspaceId" = ${workspaceId}::uuid
    ORDER BY "isDefault" DESC, "name" ASC
  `;
}

export async function listBoms(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "manufacturing");
  const rows = await db.$queryRaw<Array<{
    id: string;
    name: string;
    version: number;
    outputQuantity: Prisma.Decimal;
    finishedProductName: string | null;
    itemCount: bigint;
    isActive: boolean;
  }>>`
    SELECT b."id", b."name", b."version", b."outputQuantity", b."isActive",
           p."name" AS "finishedProductName", count(bi."id")::bigint AS "itemCount"
    FROM "boms" b
    LEFT JOIN "products" p ON p."id" = b."finishedProductId"::text AND p."workspaceId" = b."workspaceId"::text
    LEFT JOIN "bom_items" bi ON bi."bomId" = b."id"
    WHERE b."workspaceId" = ${workspaceId}::uuid
    GROUP BY b."id", p."name"
    ORDER BY b."updatedAt" DESC
  `;
  return rows.map((row) => ({
    ...row,
    outputQuantity: Number(row.outputQuantity),
    itemCount: Number(row.itemCount),
  }));
}

export async function listProductionRuns(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "manufacturing");
  const rows = await db.$queryRaw<Array<{
    id: string;
    runNumber: string;
    status: string;
    plannedOutput: Prisma.Decimal;
    actualOutput: Prisma.Decimal | null;
    wastageQuantity: Prisma.Decimal;
    bomName: string;
    createdAt: Date;
  }>>`
    SELECT pr."id", pr."runNumber", pr."status", pr."plannedOutput", pr."actualOutput",
           pr."wastageQuantity", b."name" AS "bomName", pr."createdAt"
    FROM "production_runs" pr
    JOIN "boms" b ON b."id" = pr."bomId"
    WHERE pr."workspaceId" = ${workspaceId}::uuid
    ORDER BY pr."createdAt" DESC
    LIMIT 50
  `;
  return rows.map((row) => ({
    ...row,
    plannedOutput: Number(row.plannedOutput),
    actualOutput: row.actualOutput === null ? null : Number(row.actualOutput),
    wastageQuantity: Number(row.wastageQuantity),
  }));
}

export async function getProductionRunDetail(workspaceId: string, productionRunId: string) {
  await requireWorkspaceModule(workspaceId, "manufacturing");

  const runs = await db.$queryRaw<Array<{
    id: string;
    runNumber: string;
    status: string;
    plannedOutput: Prisma.Decimal;
    actualOutput: Prisma.Decimal | null;
    wastageQuantity: Prisma.Decimal;
    notes: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    postedAt: Date | null;
    bomId: string;
    bomName: string;
    bomVersion: number;
    bomOutputQuantity: Prisma.Decimal;
    finishedProductId: string;
    finishedProductName: string | null;
  }>>`
    SELECT
      pr."id",
      pr."runNumber",
      pr."status",
      pr."plannedOutput",
      pr."actualOutput",
      pr."wastageQuantity",
      pr."notes",
      pr."createdAt",
      pr."approvedAt",
      pr."postedAt",
      b."id" AS "bomId",
      b."name" AS "bomName",
      b."version" AS "bomVersion",
      b."outputQuantity" AS "bomOutputQuantity",
      b."finishedProductId"::text AS "finishedProductId",
      p."name" AS "finishedProductName"
    FROM "production_runs" pr
    JOIN "boms" b ON b."id" = pr."bomId" AND b."workspaceId" = pr."workspaceId"
    LEFT JOIN "products" p
      ON p."id" = b."finishedProductId"::text
      AND p."workspaceId" = pr."workspaceId"::text
    WHERE pr."id" = ${productionRunId}::uuid
      AND pr."workspaceId" = ${workspaceId}::uuid
    LIMIT 1
  `;

  const run = runs[0];
  if (!run) return null;

  const consumptions = await db.$queryRaw<Array<{
    productId: string;
    productName: string | null;
    plannedQuantity: Prisma.Decimal;
    actualQuantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
  }>>`
    SELECT
      pc."productId"::text AS "productId",
      p."name" AS "productName",
      pc."plannedQuantity",
      pc."actualQuantity",
      pc."unitCost"
    FROM "production_consumptions" pc
    LEFT JOIN "products" p
      ON p."id" = pc."productId"::text
      AND p."workspaceId" = ${workspaceId}
    WHERE pc."productionRunId" = ${productionRunId}::uuid
    ORDER BY p."name" ASC NULLS LAST, pc."createdAt" ASC
  `;

  const lines = consumptions.map((item) => {
    const plannedQuantity = Number(item.plannedQuantity);
    const actualQuantity = Number(item.actualQuantity);
    const unitCost = Number(item.unitCost);
    return {
      productId: item.productId,
      productName: item.productName ?? "Unknown product",
      plannedQuantity,
      actualQuantity,
      unitCost,
      totalCost: actualQuantity * unitCost,
    };
  });

  return {
    id: run.id,
    runNumber: run.runNumber,
    status: run.status,
    plannedOutput: Number(run.plannedOutput),
    actualOutput: run.actualOutput === null ? null : Number(run.actualOutput),
    wastageQuantity: Number(run.wastageQuantity),
    notes: run.notes,
    createdAt: run.createdAt,
    approvedAt: run.approvedAt,
    postedAt: run.postedAt,
    bom: {
      id: run.bomId,
      name: run.bomName,
      version: run.bomVersion,
      outputQuantity: Number(run.bomOutputQuantity),
      finishedProductId: run.finishedProductId,
      finishedProductName: run.finishedProductName ?? "Unknown product",
    },
    consumptions: lines,
    materialCost: lines.reduce((total, line) => total + line.totalCost, 0),
  };
}


export async function getServiceQuoteDetail(workspaceId: string, quoteId: string) {
  await requireWorkspaceModule(workspaceId, "services");

  const quotes = await db.$queryRaw<Array<{
    id: string;
    customerId: string;
    quoteNumber: string;
    status: ServiceQuoteStatus;
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    validUntil: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    customerAddress: string | null;
    customerCity: string | null;
  }>>`
    SELECT
      sq."id",
      sq."customerId"::text AS "customerId",
      sq."quoteNumber",
      sq."status",
      sq."subtotal",
      sq."discount",
      sq."tax",
      sq."total",
      sq."validUntil",
      sq."notes",
      sq."createdAt",
      sq."updatedAt",
      coalesce(c."companyName", c."name") AS "customerName",
      c."phone" AS "customerPhone",
      c."email" AS "customerEmail",
      c."address" AS "customerAddress",
      c."city" AS "customerCity"
    FROM "service_quotes" sq
    LEFT JOIN "customers" c
      ON c."id" = sq."customerId"::text
      AND c."workspaceId" = sq."workspaceId"::text
    WHERE sq."id" = ${quoteId}::uuid
      AND sq."workspaceId" = ${workspaceId}::uuid
    LIMIT 1
  `;

  const quote = quotes[0];
  if (!quote) return null;

  const items = await db.$queryRaw<Array<{
    id: string;
    description: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    position: number;
  }>>`
    SELECT "id", "description", "quantity", "unitPrice", "lineTotal", "position"
    FROM "service_quote_items"
    WHERE "serviceQuoteId" = ${quoteId}::uuid
    ORDER BY "position" ASC
  `;

  const jobs = await db.$queryRaw<Array<{
    id: string;
    jobNumber: string;
    title: string;
    status: ServiceJobStatus;
    createdAt: Date;
  }>>`
    SELECT "id", "jobNumber", "title", "status", "createdAt"
    FROM "service_jobs"
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "serviceQuoteId" = ${quoteId}::uuid
    ORDER BY "createdAt" DESC
  `;

  return {
    ...quote,
    subtotal: Number(quote.subtotal),
    discount: Number(quote.discount),
    tax: Number(quote.tax),
    total: Number(quote.total),
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      position: item.position,
    })),
    jobs,
  };
}

export async function getServiceJobDetail(workspaceId: string, jobId: string) {
  await requireWorkspaceModule(workspaceId, "services");

  const rows = await db.$queryRaw<Array<{
    id: string;
    customerId: string;
    serviceQuoteId: string | null;
    jobNumber: string;
    title: string;
    description: string | null;
    status: ServiceJobStatus;
    assignedToId: string | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    customerAddress: string | null;
    customerCity: string | null;
    quoteNumber: string | null;
    assignedToName: string | null;
  }>>`
    SELECT
      sj."id",
      sj."customerId"::text AS "customerId",
      sj."serviceQuoteId"::text AS "serviceQuoteId",
      sj."jobNumber",
      sj."title",
      sj."description",
      sj."status",
      sj."assignedToId"::text AS "assignedToId",
      sj."scheduledAt",
      sj."completedAt",
      sj."createdAt",
      sj."updatedAt",
      coalesce(c."companyName", c."name") AS "customerName",
      c."phone" AS "customerPhone",
      c."email" AS "customerEmail",
      c."address" AS "customerAddress",
      c."city" AS "customerCity",
      sq."quoteNumber",
      nullif(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS "assignedToName"
    FROM "service_jobs" sj
    LEFT JOIN "customers" c
      ON c."id" = sj."customerId"::text
      AND c."workspaceId" = sj."workspaceId"::text
    LEFT JOIN "service_quotes" sq
      ON sq."id" = sj."serviceQuoteId"
      AND sq."workspaceId" = sj."workspaceId"
    LEFT JOIN "users" u
      ON u."id" = sj."assignedToId"::text
    WHERE sj."id" = ${jobId}::uuid
      AND sj."workspaceId" = ${workspaceId}::uuid
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function listServiceQuotes(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "services");
  const rows = await db.$queryRaw<Array<{
    id: string;
    customerId: string;
    quoteNumber: string;
    status: string;
    total: Prisma.Decimal;
    customerName: string | null;
    validUntil: Date | null;
    createdAt: Date;
  }>>`
    SELECT sq."id", sq."customerId"::text AS "customerId", sq."quoteNumber", sq."status", sq."total", sq."validUntil", sq."createdAt",
           coalesce(c."companyName", c."name") AS "customerName"
    FROM "service_quotes" sq
    LEFT JOIN "customers" c ON c."id" = sq."customerId"::text AND c."workspaceId" = sq."workspaceId"::text
    WHERE sq."workspaceId" = ${workspaceId}::uuid
    ORDER BY sq."createdAt" DESC
    LIMIT 50
  `;
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

export async function listServiceJobs(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "services");
  return db.$queryRaw<Array<{
    id: string;
    jobNumber: string;
    title: string;
    status: string;
    customerName: string | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>>`
    SELECT sj."id", sj."jobNumber", sj."title", sj."status", sj."scheduledAt", sj."completedAt", sj."createdAt",
           coalesce(c."companyName", c."name") AS "customerName"
    FROM "service_jobs" sj
    LEFT JOIN "customers" c ON c."id" = sj."customerId"::text AND c."workspaceId" = sj."workspaceId"::text
    WHERE sj."workspaceId" = ${workspaceId}::uuid
    ORDER BY sj."createdAt" DESC
    LIMIT 50
  `;
}

export async function getIndustryHealth(workspaceId: string) {
  const [modules, restaurantTables, recipes, kitchenOpen, boms, productionOpen, warehouses, quotes, jobs] = await Promise.all([
    listWorkspaceModules(workspaceId),
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "restaurant_tables" WHERE "workspaceId"=${workspaceId}::uuid`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "recipes" WHERE "workspaceId"=${workspaceId}::uuid AND "isActive"=true`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid AND "status" IN ('QUEUED','PREPARING','READY')`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "boms" WHERE "workspaceId"=${workspaceId}::uuid AND "isActive"=true`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "production_runs" WHERE "workspaceId"=${workspaceId}::uuid AND "status" IN ('DRAFT','APPROVED')`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "warehouses" WHERE "workspaceId"=${workspaceId}::uuid AND "isActive"=true`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "service_quotes" WHERE "workspaceId"=${workspaceId}::uuid`,
    db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS "count" FROM "service_jobs" WHERE "workspaceId"=${workspaceId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')`,
  ]);
  return {
    modules,
    restaurant: { tables: Number(restaurantTables[0]?.count ?? 0), recipes: Number(recipes[0]?.count ?? 0), openKitchenTickets: Number(kitchenOpen[0]?.count ?? 0) },
    manufacturing: { boms: Number(boms[0]?.count ?? 0), openProductionRuns: Number(productionOpen[0]?.count ?? 0), warehouses: Number(warehouses[0]?.count ?? 0) },
    services: { quotations: Number(quotes[0]?.count ?? 0), openJobs: Number(jobs[0]?.count ?? 0) },
  };
}
