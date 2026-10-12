import "server-only";

import { Prisma } from "@prisma/client";
import { applyManagedWarehouseStockDelta } from "@/lib/server/managed-warehouse-stock";

/**
 * Customer assemblies use the same physical component inventory as ordinary
 * sales. Capture their component prices/quantities at dispatch so subsequent
 * edits to a customer BOM cannot retrospectively change an issued delivery.
 *
 * The outgoing parent and components remain owned inventory while in transit;
 * acceptance moves the bundled historical cost to COGS exactly once.
 */
export type GatePassBomComponentSnapshot = {
  productId: string;
  productCode: string;
  name: string;
  sku: string | null;
  quantityPerUnit: string;
  unitCost: string;
};
export type GatePassBomSnapshot = {
  version: 1;
  components: GatePassBomComponentSnapshot[];
};

type BOMRow = {
  parentProductId: string;
  productCode: string;
  componentProductId: string | null;
  quantityPerUnit: Prisma.Decimal | null;
  componentName: string | null;
  componentSku: string | null;
  componentStatus: string | null;
  unitCost: Prisma.Decimal | null;
};

type GatePassLine = { id: string; productId: string; dispatchedQuantity: Prisma.Decimal };

export class GatePassBomError extends Error {}

export function readGatePassBomSnapshot(value: Prisma.JsonValue | null | undefined): GatePassBomComponentSnapshot[] {
  if (value == null) return [];
  if (!value || Array.isArray(value) || typeof value !== "object" ||
      value.version !== 1 || !Array.isArray(value.components)) {
    throw new GatePassBomError("Historical Gate Pass component snapshot is corrupted.");
  }
  const ids = new Set<string>();
  return value.components.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.productId !== "string" || typeof entry.productCode !== "string" ||
        typeof entry.name !== "string" ||
        (entry.sku !== null && typeof entry.sku !== "string") ||
        typeof entry.quantityPerUnit !== "string" || typeof entry.unitCost !== "string") {
      throw new GatePassBomError("Historical Gate Pass component snapshot has invalid fields.");
    }
    const unitQuantity = new Prisma.Decimal(entry.quantityPerUnit);
    const unitCost = new Prisma.Decimal(entry.unitCost);
    if (ids.has(entry.productId) || unitQuantity.lte(0) || unitQuantity.decimalPlaces() > 4 ||
        !unitQuantity.isFinite() || unitCost.isNegative() || !unitCost.isFinite()) {
      throw new GatePassBomError("Historical Gate Pass component quantities cannot be reconciled.");
    }
    ids.add(entry.productId);
    return {
      productId: entry.productId,
      productCode: entry.productCode,
      name: entry.name,
      sku: entry.sku,
      quantityPerUnit: entry.quantityPerUnit,
      unitCost: entry.unitCost,
    };
  });
}

export async function planGatePassBomDispatch(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; customerId: string; lines: GatePassLine[] },
) {
  const ids = input.lines.map((line) => line.productId);
  if (!ids.length) return { byItem: new Map<string, { snapshot: GatePassBomSnapshot; embeddedUnitCost: Prisma.Decimal }>(), deductions: new Map<string, Prisma.Decimal>(), products: new Map<string, { costPrice: Prisma.Decimal; name: string }>() };
  const rows = await tx.$queryRaw<BOMRow[]>(Prisma.sql`
    SELECT b."productId"::text AS "parentProductId", b."productCode",
      i."componentProductId"::text AS "componentProductId", i."quantityPerUnit",
      p."name" AS "componentName", p."sku" AS "componentSku",
      p."status"::text AS "componentStatus", p."costPrice" AS "unitCost"
    FROM "customer_sales_boms" b
    LEFT JOIN "customer_sales_bom_items" i ON i."customerSalesBomId"=b."id"
    LEFT JOIN "products" p ON p."id"=i."componentProductId"::text AND p."workspaceId"=${input.workspaceId}
    WHERE b."workspaceId"=${input.workspaceId}::uuid
      AND b."customerId"=${input.customerId}::uuid AND b."isActive"=true
      AND b."productId"::text IN (${Prisma.join(ids)})
    ORDER BY b."productId", i."createdAt"
  `);
  const grouped = new Map<string, BOMRow[]>();
  for (const row of rows) grouped.set(row.parentProductId, [...(grouped.get(row.parentProductId) ?? []), row]);
  const componentIds = [...new Set(rows.map((row) => row.componentProductId).filter((v): v is string => Boolean(v)))];
  const products = await tx.product.findMany({
    where: { workspaceId: input.workspaceId, id: { in: componentIds }, status: "ACTIVE" },
    select: { id: true, costPrice: true, name: true, stockQuantity: true },
  });
  if (products.length !== componentIds.length) throw new GatePassBomError("Customer assembly components are missing or inactive.");
  const productById = new Map(products.map((item) => [item.id, item]));
  const byItem = new Map<string, { snapshot: GatePassBomSnapshot; embeddedUnitCost: Prisma.Decimal }>();
  const deductions = new Map<string, Prisma.Decimal>();
  for (const item of input.lines) {
    const bomRows = grouped.get(item.productId);
    if (!bomRows) continue;
    if (!bomRows.length || bomRows.some((row) => !row.componentProductId || !row.quantityPerUnit)) {
      throw new GatePassBomError("Customer assembly configuration has no valid components.");
    }
    let embedded = new Prisma.Decimal(0);
    const components: GatePassBomComponentSnapshot[] = [];
    const seen = new Set<string>();
    for (const row of bomRows) {
      const productId = row.componentProductId!;
      const product = productById.get(productId);
      const quantityPerUnit = row.quantityPerUnit!;
      if (!product || !row.componentName || row.componentStatus !== "ACTIVE" ||
          product.costPrice.isNegative() || !product.costPrice.isFinite() ||
          productId === item.productId || seen.has(productId) ||
          quantityPerUnit.lte(0) || quantityPerUnit.decimalPlaces() > 4) {
        throw new GatePassBomError("Customer assembly components are invalid or duplicated.");
      }
      seen.add(productId);
      const needed = quantityPerUnit.mul(item.dispatchedQuantity);
      if (needed.decimalPlaces() > 4 || !needed.isFinite()) {
        throw new GatePassBomError("Assembly component units exceed stock precision.");
      }
      embedded = embedded.plus(quantityPerUnit.mul(product.costPrice));
      deductions.set(productId, (deductions.get(productId) ?? new Prisma.Decimal(0)).plus(needed));
      components.push({
        productId,
        productCode: row.productCode,
        name: row.componentName,
        sku: row.componentSku,
        quantityPerUnit: quantityPerUnit.toString(),
        unitCost: product.costPrice.toString(),
      });
    }
    byItem.set(item.id, { snapshot: { version: 1, components }, embeddedUnitCost: embedded });
  }
  for (const [id, required] of deductions) {
    const product = productById.get(id)!;
    if (product.stockQuantity.lt(required)) {
      throw new GatePassBomError(`Insufficient component stock: ${product.name} needs ${required.toString()} units.`);
    }
  }
  return { byItem, deductions, products: new Map(products.map((item) => [item.id, { costPrice: item.costPrice, name: item.name }])) };
}

export async function deductGatePassBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    warehouseId: string | null;
    gatePassNumber: string;
    deductions: Map<string, Prisma.Decimal>;
    products: Map<string, { costPrice: Prisma.Decimal; name: string }>;
  },
) {
  for (const [productId, quantity] of input.deductions) {
    const product = input.products.get(productId)!;
    const result = await tx.product.updateMany({
      where: { workspaceId: input.workspaceId, id: productId, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (result.count !== 1) {
      throw new GatePassBomError(`Component ${product.name} has insufficient stock for this dispatch.`);
    }
    await applyManagedWarehouseStockDelta(tx, {
      workspaceId: input.workspaceId, warehouseId: input.warehouseId,
      productId, delta: quantity.negated(),
    });
    await tx.inventoryTransaction.create({
      data: { workspaceId: input.workspaceId, productId, type: "GATE_PASS_DISPATCH",
        quantityChanged: quantity.negated(), unitCost: product.costPrice,
        reference: `BOM:${input.gatePassNumber}` },
    });
  }
}

export async function snapshotAcceptedGatePassBomComponents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string; salesOrderId: string;
    acceptedLines: Array<{ productId: string; acceptedQuantity: Prisma.Decimal; snapshot: Prisma.JsonValue | null }>;
  },
) {
  for (const line of input.acceptedLines) {
    for (const component of readGatePassBomSnapshot(line.snapshot)) {
      const perUnit = new Prisma.Decimal(component.quantityPerUnit);
      const required = perUnit.mul(line.acceptedQuantity);
      await tx.$executeRaw`
        INSERT INTO "sales_order_component_snapshots"
          ("workspaceId","salesOrderId","parentProductId","componentProductId",
            "productCode","componentName","componentSku",
            "quantityPerUnit","soldQuantity","totalQuantityConsumed","unitCost")
        VALUES (${input.workspaceId}::uuid,${input.salesOrderId}::uuid,
          ${line.productId}::uuid,${component.productId}::uuid,
          ${component.productCode},${component.name},${component.sku},
          ${perUnit},${line.acceptedQuantity},${required},${new Prisma.Decimal(component.unitCost)})
      `;
    }
  }
}
