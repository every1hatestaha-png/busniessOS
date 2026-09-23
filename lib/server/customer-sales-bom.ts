import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { applyManagedWarehouseStockDelta, ManagedWarehouseStockError } from "@/lib/server/managed-warehouse-stock";

export type CustomerSalesBomContext = { workspaceId: string; role: Role; userId?: string };

export class CustomerSalesBomError extends Error {
  constructor(
    public readonly code: "PERMISSION_DENIED" | "NOT_FOUND" | "INVALID_INPUT" | "INSUFFICIENT_STOCK" | "WAREHOUSE_STOCK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "CustomerSalesBomError";
  }
}

export type CustomerSalesBomInput = {
  productId: string;
  productCode?: string;
  components: Array<{ componentProductId: string; quantityPerUnit: number }>;
};

type SalesLine = { productId: string; quantity: number | Prisma.Decimal };

type BomRow = {
  parentProductId: string;
  productCode: string;
  componentProductId: string;
  quantityPerUnit: Prisma.Decimal;
  componentName: string;
  componentSku: string | null;
  componentStatus: string;
};

type SnapshotRow = {
  parentProductId: string;
  componentProductId: string;
  productCode: string;
  componentName: string;
  componentSku: string | null;
  quantityPerUnit: Prisma.Decimal;
  soldQuantity: Prisma.Decimal;
  totalQuantityConsumed: Prisma.Decimal;
  unitCost: Prisma.Decimal;
};

function assertManager(context: CustomerSalesBomContext) {
  if (!(["OWNER", "ADMIN", "MANAGER"] as Role[]).includes(context.role)) {
    throw new CustomerSalesBomError("PERMISSION_DENIED", "Manager access is required to configure customer products.");
  }
}

function productCodeFromName(name: string) {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return (initials || name.slice(0, 8)).replace(/[^A-Z0-9_-]/g, "").slice(0, 30) || "PRODUCT";
}

function normalizeCode(input: string | undefined, fallbackName: string) {
  const clean = (input ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
  return clean || productCodeFromName(fallbackName);
}

function normalizeComponents(components: CustomerSalesBomInput["components"]) {
  if (!components.length) throw new CustomerSalesBomError("INVALID_INPUT", "Add at least one accessory or component.");
  const seen = new Set<string>();
  return components.map((component) => {
    if (seen.has(component.componentProductId)) throw new CustomerSalesBomError("INVALID_INPUT", "The same component cannot be added twice.");
    seen.add(component.componentProductId);
    const quantity = new Prisma.Decimal(component.quantityPerUnit);
    if (!quantity.isFinite() || quantity.lte(0) || quantity.gt(100000000)) {
      throw new CustomerSalesBomError("INVALID_INPUT", "Each component quantity must be greater than zero.");
    }
    if (quantity.decimalPlaces() > 4) throw new CustomerSalesBomError("INVALID_INPUT", "Component quantities support up to four decimal places.");
    return { componentProductId: component.componentProductId, quantityPerUnit: quantity };
  });
}

export async function listCustomerSalesBoms(workspaceId: string, customerId: string) {
  const rows = await db.$queryRaw<Array<{
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    productSku: string | null;
    componentProductId: string | null;
    componentName: string | null;
    componentSku: string | null;
    quantityPerUnit: Prisma.Decimal | null;
  }>>`
    SELECT b."id"::text AS "id",
           b."productId"::text AS "productId",
           b."productCode",
           p."name" AS "productName",
           p."sku" AS "productSku",
           i."componentProductId"::text AS "componentProductId",
           cp."name" AS "componentName",
           cp."sku" AS "componentSku",
           i."quantityPerUnit"
    FROM "customer_sales_boms" b
    JOIN "products" p
      ON p."id" = b."productId"::text
     AND p."workspaceId" = ${workspaceId}
    LEFT JOIN "customer_sales_bom_items" i ON i."customerSalesBomId" = b."id"
    LEFT JOIN "products" cp
      ON cp."id" = i."componentProductId"::text
     AND cp."workspaceId" = ${workspaceId}
    WHERE b."workspaceId"=${workspaceId}::uuid
      AND b."customerId"=${customerId}::uuid
      AND b."isActive"=true
    ORDER BY p."name" ASC, cp."name" ASC NULLS LAST
  `;

  const grouped = new Map<string, {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    productSku: string | null;
    components: Array<{ componentProductId: string; componentName: string; componentSku: string | null; quantityPerUnit: number }>;
  }>();
  for (const row of rows) {
    const entry = grouped.get(row.id) ?? {
      id: row.id,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      productSku: row.productSku,
      components: [],
    };
    if (row.componentProductId && row.componentName && row.quantityPerUnit) {
      entry.components.push({
        componentProductId: row.componentProductId,
        componentName: row.componentName,
        componentSku: row.componentSku,
        quantityPerUnit: Number(row.quantityPerUnit),
      });
    }
    grouped.set(row.id, entry);
  }
  return [...grouped.values()];
}

export async function saveCustomerSalesBom(context: CustomerSalesBomContext, customerId: string, input: CustomerSalesBomInput) {
  assertManager(context);
  const components = normalizeComponents(input.components);
  if (components.some((component) => component.componentProductId === input.productId)) {
    throw new CustomerSalesBomError("INVALID_INPUT", "A product cannot consume itself as an accessory.");
  }

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, workspaceId: context.workspaceId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!customer) throw new CustomerSalesBomError("NOT_FOUND", "Customer is unavailable.");

    const productIds = [input.productId, ...components.map((component) => component.componentProductId)];
    const products = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: productIds }, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (products.length !== new Set(productIds).size) {
      throw new CustomerSalesBomError("NOT_FOUND", "One or more selected products are unavailable in this workspace.");
    }
    const parent = products.find((product) => product.id === input.productId)!;
    const productCode = normalizeCode(input.productCode, parent.name);

    const [bom] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "customer_sales_boms" ("workspaceId", "customerId", "productId", "productCode", "isActive", "updatedAt")
      VALUES (${context.workspaceId}::uuid, ${customerId}::uuid, ${input.productId}::uuid, ${productCode}, true, now())
      ON CONFLICT ("workspaceId", "customerId", "productId")
      DO UPDATE SET "productCode"=EXCLUDED."productCode", "isActive"=true, "updatedAt"=now()
      RETURNING "id"::text AS "id"
    `;
    await tx.$executeRaw`DELETE FROM "customer_sales_bom_items" WHERE "customerSalesBomId"=${bom!.id}::uuid`;
    for (const component of components) {
      await tx.$executeRaw`
        INSERT INTO "customer_sales_bom_items" ("customerSalesBomId", "componentProductId", "quantityPerUnit")
        VALUES (${bom!.id}::uuid, ${component.componentProductId}::uuid, ${component.quantityPerUnit})
      `;
    }
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_sales_bom.saved",
      entityType: "CustomerSalesBom",
      entityId: bom!.id,
      metadata: { customerId, productId: input.productId, productCode, componentCount: components.length },
    });
    return { id: bom!.id, productCode };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteCustomerSalesBom(context: CustomerSalesBomContext, customerId: string, bomId: string) {
  assertManager(context);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; productId: string }>>`
      UPDATE "customer_sales_boms"
      SET "isActive"=false, "updatedAt"=now()
      WHERE "id"=${bomId}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
        AND "customerId"=${customerId}::uuid
        AND "isActive"=true
      RETURNING "id"::text AS "id", "productId"::text AS "productId"
    `;
    const row = rows[0];
    if (!row) throw new CustomerSalesBomError("NOT_FOUND", "Customer product configuration was not found.");
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_sales_bom.archived",
      entityType: "CustomerSalesBom",
      entityId: row.id,
      metadata: { customerId, productId: row.productId },
    });
    return { id: row.id };
  });
}

async function loadBomRows(tx: Prisma.TransactionClient, workspaceId: string, customerId: string, parentProductIds: string[]) {
  if (!parentProductIds.length) return [] as BomRow[];
  return tx.$queryRaw<BomRow[]>(Prisma.sql`
    SELECT b."productId"::text AS "parentProductId",
           b."productCode",
           i."componentProductId"::text AS "componentProductId",
           i."quantityPerUnit",
           p."name" AS "componentName",
           p."sku" AS "componentSku",
           p."status"::text AS "componentStatus"
    FROM "customer_sales_boms" b
    JOIN "customer_sales_bom_items" i ON i."customerSalesBomId" = b."id"
    LEFT JOIN "products" p
      ON p."id" = i."componentProductId"::text
     AND p."workspaceId" = ${workspaceId}
    WHERE b."workspaceId"=${workspaceId}::uuid
      AND b."customerId"=${customerId}::uuid
      AND b."isActive"=true
      AND b."productId" IN (${Prisma.join(parentProductIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY b."productId", i."createdAt"
  `);
}

async function applyWarehouseDelta(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; warehouseId?: string | null; productId: string; delta: Prisma.Decimal },
) {
  try {
    await applyManagedWarehouseStockDelta(tx, input);
  } catch (error) {
    if (error instanceof ManagedWarehouseStockError) {
      if (error.code === "NEGATIVE_WAREHOUSE_STOCK") {
        throw new CustomerSalesBomError("INSUFFICIENT_STOCK", "A linked accessory does not have enough stock in the selected warehouse.");
      }
      throw new CustomerSalesBomError("WAREHOUSE_STOCK_ERROR", error.message);
    }
    throw error;
  }
}

export async function consumeCustomerSalesBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    customerId: string;
    salesOrderId: string;
    orderNumber: string;
    warehouseId?: string | null;
    lines: SalesLine[];
  },
) {
  const quantityByParent = new Map(input.lines.map((line) => [line.productId, new Prisma.Decimal(line.quantity)]));
  const rows = await loadBomRows(tx, input.workspaceId, input.customerId, [...quantityByParent.keys()]);
  if (!rows.length) return { costOfGoodsSold: new Prisma.Decimal(0), componentCount: 0 };

  const snapshotDrafts = rows.map((row) => {
    const soldQuantity = quantityByParent.get(row.parentProductId)!;
    if (!row.componentName || row.componentStatus !== "ACTIVE") {
      throw new CustomerSalesBomError("NOT_FOUND", "A linked accessory is no longer active in inventory.");
    }
    const totalQuantityConsumed = row.quantityPerUnit.mul(soldQuantity);
    return { ...row, soldQuantity, totalQuantityConsumed };
  });

  const componentIds = [...new Set(snapshotDrafts.map((row) => row.componentProductId))];
  const products = await tx.product.findMany({
    where: { workspaceId: input.workspaceId, id: { in: componentIds }, status: "ACTIVE" },
    select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true },
  });
  if (products.length !== componentIds.length) throw new CustomerSalesBomError("NOT_FOUND", "A linked accessory is unavailable.");

  const totalByComponent = new Map<string, Prisma.Decimal>();
  for (const row of snapshotDrafts) {
    totalByComponent.set(row.componentProductId, (totalByComponent.get(row.componentProductId) ?? new Prisma.Decimal(0)).plus(row.totalQuantityConsumed));
  }
  for (const [componentProductId, required] of totalByComponent) {
    const product = products.find((entry) => entry.id === componentProductId)!;
    if (product.stockQuantity.lt(required)) {
      throw new CustomerSalesBomError("INSUFFICIENT_STOCK", `${product.name} requires ${required.toString()} for this sale, but only ${product.stockQuantity.toString()} is available.`);
    }
  }

  let costOfGoodsSold = new Prisma.Decimal(0);
  for (const [componentProductId, required] of totalByComponent) {
    const product = products.find((entry) => entry.id === componentProductId)!;
    const changed = await tx.product.updateMany({
      where: { id: componentProductId, workspaceId: input.workspaceId, stockQuantity: { gte: required } },
      data: { stockQuantity: { decrement: required } },
    });
    if (changed.count !== 1) throw new CustomerSalesBomError("INSUFFICIENT_STOCK", `${product.name} inventory changed while posting the sale. Retry the sale.`);
    await applyWarehouseDelta(tx, {
      workspaceId: input.workspaceId,
      warehouseId: input.warehouseId,
      productId: componentProductId,
      delta: required.negated(),
    });
    await tx.inventoryTransaction.create({
      data: {
        workspaceId: input.workspaceId,
        productId: componentProductId,
        type: "SALE",
        quantityChanged: required.negated(),
        unitCost: product.costPrice,
        reference: `BOM:${input.orderNumber}`,
      },
    });
    costOfGoodsSold = costOfGoodsSold.plus(product.costPrice.mul(required));
  }

  for (const row of snapshotDrafts) {
    const product = products.find((entry) => entry.id === row.componentProductId)!;
    await tx.$executeRaw`
      INSERT INTO "sales_order_component_snapshots"
        ("workspaceId", "salesOrderId", "parentProductId", "componentProductId", "productCode", "componentName", "componentSku", "quantityPerUnit", "soldQuantity", "totalQuantityConsumed", "unitCost")
      VALUES
        (${input.workspaceId}::uuid, ${input.salesOrderId}::uuid, ${row.parentProductId}::uuid, ${row.componentProductId}::uuid, ${row.productCode}, ${product.name}, ${product.sku}, ${row.quantityPerUnit}, ${row.soldQuantity}, ${row.totalQuantityConsumed}, ${product.costPrice})
    `;
  }

  return { costOfGoodsSold, componentCount: snapshotDrafts.length };
}

async function getSnapshots(tx: Prisma.TransactionClient, workspaceId: string, salesOrderId: string) {
  return tx.$queryRaw<SnapshotRow[]>`
    SELECT "parentProductId"::text AS "parentProductId",
           "componentProductId"::text AS "componentProductId",
           "productCode", "componentName", "componentSku",
           "quantityPerUnit", "soldQuantity", "totalQuantityConsumed", "unitCost"
    FROM "sales_order_component_snapshots"
    WHERE "workspaceId"=${workspaceId}::uuid AND "salesOrderId"=${salesOrderId}::uuid
    ORDER BY "createdAt" ASC
  `;
}

async function restoreComponentStock(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; warehouseId?: string | null; productId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal },
) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, workspaceId: input.workspaceId },
    select: { id: true, name: true, stockQuantity: true, costPrice: true },
  });
  if (!product) throw new CustomerSalesBomError("NOT_FOUND", "A historical sale accessory no longer exists.");
  const resultingQuantity = product.stockQuantity.plus(input.quantity);
  const resultingCost = resultingQuantity.isZero()
    ? product.costPrice
    : product.costPrice.mul(product.stockQuantity).plus(input.unitCost.mul(input.quantity)).div(resultingQuantity);
  const changed = await tx.product.updateMany({
    where: { id: product.id, workspaceId: input.workspaceId, stockQuantity: product.stockQuantity },
    data: { stockQuantity: { increment: input.quantity }, costPrice: resultingCost },
  });
  if (changed.count !== 1) throw new CustomerSalesBomError("INVALID_INPUT", "Accessory inventory changed while reversing stock. Retry the action.");
  await applyWarehouseDelta(tx, { workspaceId: input.workspaceId, warehouseId: input.warehouseId, productId: product.id, delta: input.quantity });
}

export async function restoreSaleBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    salesOrderId: string;
    orderNumber: string;
    warehouseId?: string | null;
    mode: "CANCEL" | "EDIT";
  },
) {
  const snapshots = await getSnapshots(tx, input.workspaceId, input.salesOrderId);
  for (const snapshot of snapshots) {
    await restoreComponentStock(tx, {
      workspaceId: input.workspaceId,
      warehouseId: input.warehouseId,
      productId: snapshot.componentProductId,
      quantity: snapshot.totalQuantityConsumed,
      unitCost: snapshot.unitCost,
    });
    if (input.mode === "CANCEL") {
      await tx.inventoryTransaction.create({
        data: {
          workspaceId: input.workspaceId,
          productId: snapshot.componentProductId,
          type: "SALE_CANCELLATION",
          quantityChanged: snapshot.totalQuantityConsumed,
          unitCost: snapshot.unitCost,
          reference: `BOM:${input.orderNumber}`,
        },
      });
    }
  }
  if (input.mode === "EDIT") {
    await tx.inventoryTransaction.deleteMany({
      where: { workspaceId: input.workspaceId, type: "SALE", reference: `BOM:${input.orderNumber}` },
    });
    await tx.$executeRaw`
      DELETE FROM "sales_order_component_snapshots"
      WHERE "workspaceId"=${input.workspaceId}::uuid AND "salesOrderId"=${input.salesOrderId}::uuid
    `;
  }
  return snapshots;
}

/**
 * A physical customer return brings the assembled parent item back. Its linked
 * bearings/seals/etc remain embedded in that returned unit and must not become
 * separately usable component stock. Preserve the original component value by
 * folding it into the returned parent's WAC and historical RETURN_IN unit cost.
 *
 * This deliberately differs from sale cancellation/edit: those reverse the
 * original transaction before the goods are treated as physically returned,
 * so their component stock can be restored from the immutable sale snapshot.
 */
export async function restoreReturnedBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    salesOrderId: string;
    warehouseId?: string | null;
    returnNumber: string;
    lines: Array<{ parentProductId: string; quantity: number | Prisma.Decimal }>;
  },
) {
  const snapshots = await getSnapshots(tx, input.workspaceId, input.salesOrderId);
  let inventoryCost = new Prisma.Decimal(0);

  for (const line of input.lines) {
    const returnedQuantity = new Prisma.Decimal(line.quantity);
    if (returnedQuantity.lte(0)) continue;
    const parentSnapshots = snapshots.filter((entry) => entry.parentProductId === line.parentProductId);
    if (!parentSnapshots.length) continue;

    const embeddedUnitCost = parentSnapshots.reduce(
      (sum, snapshot) => sum.plus(snapshot.unitCost.mul(snapshot.quantityPerUnit)),
      new Prisma.Decimal(0),
    );
    if (embeddedUnitCost.lte(0)) continue;
    const embeddedValue = embeddedUnitCost.mul(returnedQuantity);

    const parent = await tx.product.findFirst({
      where: { id: line.parentProductId, workspaceId: input.workspaceId },
      select: { id: true, stockQuantity: true, costPrice: true },
    });
    if (!parent) throw new CustomerSalesBomError("NOT_FOUND", "A returned BOM parent product no longer exists.");
    if (parent.stockQuantity.lte(0)) throw new CustomerSalesBomError("INVALID_INPUT", "Returned BOM stock could not be valued safely.");

    // createCustomerReturn has already restored the parent quantity at its
    // historical base cost. Add only the embedded component value here.
    const resultingCost = parent.costPrice.mul(parent.stockQuantity).plus(embeddedValue).div(parent.stockQuantity);
    const changed = await tx.product.updateMany({
      where: { id: parent.id, workspaceId: input.workspaceId, stockQuantity: parent.stockQuantity },
      data: { costPrice: resultingCost },
    });
    if (changed.count !== 1) throw new CustomerSalesBomError("INVALID_INPUT", "Returned BOM inventory changed while valuing embedded components. Retry the return.");

    const returnMovement = await tx.inventoryTransaction.findFirst({
      where: {
        workspaceId: input.workspaceId,
        productId: parent.id,
        type: "RETURN_IN",
        reference: input.returnNumber,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, unitCost: true },
    });
    if (!returnMovement?.unitCost) {
      throw new CustomerSalesBomError("INVALID_INPUT", "Historical returned-product cost is unavailable; BOM return valuation is unsafe.");
    }
    await tx.inventoryTransaction.update({
      where: { id: returnMovement.id },
      data: { unitCost: returnMovement.unitCost.plus(embeddedUnitCost) },
    });

    inventoryCost = inventoryCost.plus(embeddedValue);
  }

  return inventoryCost;
}

async function removeRestoredComponentStock(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; warehouseId?: string | null; productId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal },
) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, workspaceId: input.workspaceId },
    select: { id: true, name: true, stockQuantity: true, costPrice: true },
  });
  if (!product) throw new CustomerSalesBomError("NOT_FOUND", "A returned accessory no longer exists.");
  if (product.stockQuantity.lt(input.quantity)) {
    throw new CustomerSalesBomError("INSUFFICIENT_STOCK", `${product.name} returned stock has already been consumed.`);
  }
  const historicalValue = input.unitCost.mul(input.quantity);
  const resultingQuantity = product.stockQuantity.minus(input.quantity);
  const resultingValue = product.costPrice.mul(product.stockQuantity).minus(historicalValue);
  if (resultingValue.lt(0)) throw new CustomerSalesBomError("INVALID_INPUT", `Reversing ${product.name} would create a negative inventory value.`);
  const resultingCost = resultingQuantity.gt(0) ? resultingValue.div(resultingQuantity) : new Prisma.Decimal(0);
  const changed = await tx.product.updateMany({
    where: { id: product.id, workspaceId: input.workspaceId, stockQuantity: product.stockQuantity },
    data: { stockQuantity: { decrement: input.quantity }, costPrice: resultingCost },
  });
  if (changed.count !== 1) throw new CustomerSalesBomError("INVALID_INPUT", "Accessory inventory changed while cancelling the return. Retry the action.");
  await applyWarehouseDelta(tx, { workspaceId: input.workspaceId, warehouseId: input.warehouseId, productId: product.id, delta: input.quantity.negated() });
}

/**
 * New BOM returns restore only the assembled parent, so their normal parent
 * reversal fully removes the composite value. Keep legacy compatibility for
 * returns created before this fix by reversing only historical BOM:RETURN_IN
 * component movements that actually exist.
 */
export async function reverseReturnedBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    salesOrderId: string;
    warehouseId?: string | null;
    returnNumber: string;
    lines: Array<{ parentProductId: string; quantity: number | Prisma.Decimal }>;
  },
) {
  const legacyMovements = await tx.inventoryTransaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      type: "RETURN_IN",
      reference: `BOM:${input.returnNumber}`,
    },
    select: { productId: true, quantityChanged: true, unitCost: true },
  });

  for (const movement of legacyMovements) {
    if (movement.quantityChanged.lte(0) || !movement.unitCost) continue;
    await removeRestoredComponentStock(tx, {
      workspaceId: input.workspaceId,
      warehouseId: input.warehouseId,
      productId: movement.productId,
      quantity: movement.quantityChanged,
      unitCost: movement.unitCost,
    });
    await tx.inventoryTransaction.create({
      data: {
        workspaceId: input.workspaceId,
        productId: movement.productId,
        type: "ADJUSTMENT",
        quantityChanged: movement.quantityChanged.negated(),
        unitCost: movement.unitCost,
        reference: `REV-BOM:${input.returnNumber}`,
      },
    });
  }
}