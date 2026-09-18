import "server-only";

import { db } from "@/lib/server/db";
import { businessDayEnd, businessDayStart, businessMonthStart } from "@/lib/server/business-time";
import { sortStatementRowsByBusinessDay } from "@/lib/statement-order";
import { Prisma } from "@prisma/client";
import { getWarehouseStockMode } from "@/lib/server/managed-warehouse-stock";

export type StatementFilters = { from?: Date; to?: Date; search?: string };

type StatementEntry = {
  id: string;
  date: string;
  documentNo: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  href: string | null;
};

function statementRange(filters: StatementFilters) {
  const now = new Date();
  return { from: filters.from ? businessDayStart(filters.from) : businessMonthStart(now), to: businessDayEnd(filters.to ?? now) };
}

function statementHref(type: string, referenceId: string | null) {
  if (!referenceId) return null;
  if (type === "SALE") return `/sales/${referenceId}`;
  if (type === "PAYMENT_RECEIVED") return null;
  if (type === "GOODS_RECEIVED") return `/goods-receipts/${referenceId}`;
  if (type === "PAYMENT_MADE") return `/accounting/payment-vouchers/${referenceId}`;
  return null;
}

export async function getCustomerStatement(workspaceId: string, customerId: string, filters: StatementFilters = {}) {
  const { from, to } = statementRange(filters);
  const customer = await db.customer.findFirst({ where: { id: customerId, workspaceId }, select: { id: true, name: true, companyName: true, phone: true, email: true, address: true, city: true } });
  if (!customer) return null;
  const [opening, rows] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { workspaceId, customerId, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.ledgerEntry.findMany({
      where: { workspaceId, customerId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, date: true, createdAt: true, type: true, referenceId: true, description: true, debit: true, credit: true },
    }),
  ]);
  let runningBalance = Number(opening._sum.debit ?? 0) - Number(opening._sum.credit ?? 0);
  const allEntries: StatementEntry[] = sortStatementRowsByBusinessDay(rows).map((row) => {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    runningBalance = new Prisma.Decimal(runningBalance).plus(debit).minus(credit).toNumber();
    return { id: row.id, date: row.date.toISOString(), documentNo: row.referenceId ?? "-", description: row.description ?? row.type.replaceAll("_", " "), debit, credit, runningBalance, href: statementHref(row.type, row.referenceId) };
  });
  const search = filters.search?.trim().toLowerCase();
  const entries = search ? allEntries.filter((entry) => entry.documentNo.toLowerCase().includes(search) || entry.description.toLowerCase().includes(search)) : allEntries;
  return { party: { ...customer, displayName: customer.companyName ?? customer.name }, from: from.toISOString(), to: to.toISOString(), openingBalance: Number(opening._sum.debit ?? 0) - Number(opening._sum.credit ?? 0), closingBalance: runningBalance, entries };
}

export async function getSupplierStatement(workspaceId: string, supplierId: string, filters: StatementFilters = {}) {
  const { from, to } = statementRange(filters);
  const supplier = await db.supplier.findFirst({ where: { id: supplierId, workspaceId }, select: { id: true, name: true, companyName: true, phone: true, email: true, address: true, city: true } });
  if (!supplier) return null;
  const [opening, rows] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { workspaceId, supplierId, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.ledgerEntry.findMany({
      where: { workspaceId, supplierId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, date: true, createdAt: true, type: true, referenceId: true, description: true, debit: true, credit: true },
    }),
  ]);
  let runningBalance = Number(opening._sum.credit ?? 0) - Number(opening._sum.debit ?? 0);
  const allEntries: StatementEntry[] = sortStatementRowsByBusinessDay(rows).map((row) => {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    runningBalance = new Prisma.Decimal(runningBalance).plus(credit).minus(debit).toNumber();
    return { id: row.id, date: row.date.toISOString(), documentNo: row.referenceId ?? "-", description: row.description ?? row.type.replaceAll("_", " "), debit, credit, runningBalance, href: statementHref(row.type, row.referenceId) };
  });
  const search = filters.search?.trim().toLowerCase();
  const entries = search ? allEntries.filter((entry) => entry.documentNo.toLowerCase().includes(search) || entry.description.toLowerCase().includes(search)) : allEntries;
  return { party: { ...supplier, displayName: supplier.companyName ?? supplier.name }, from: from.toISOString(), to: to.toISOString(), openingBalance: Number(opening._sum.credit ?? 0) - Number(opening._sum.debit ?? 0), closingBalance: runningBalance, entries };
}

export async function getCurrentStockReport(workspaceId: string, search?: string, lowStockOnly = false) {
  const [products, inventoryAccount, warehouseMode] = await Promise.all([
    db.product.findMany({
      where: { workspaceId, AND: [{ OR: [{ status: { not: "ARCHIVED" } }, { stockQuantity: { not: 0 } }] }, ...(search ? [{ OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }, { category: { contains: search, mode: "insensitive" as const } }] }] : [])] },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sku: true, category: true, stockQuantity: true, costPrice: true, reorderLevel: true, unit: true, status: true },
    }),
    db.account.findUnique({ where: { workspaceId_systemCode: { workspaceId, systemCode: "INVENTORY" } }, select: { id: true } }),
    getWarehouseStockMode(workspaceId),
  ]);

  const warehouseRows = warehouseMode === "MANAGED" && products.length
    ? await db.$queryRaw<Array<{ productId: string; warehouseId: string; warehouseName: string; warehouseCode: string; quantity: Prisma.Decimal }>>`
        SELECT ws."productId"::text AS "productId",
               ws."warehouseId"::text AS "warehouseId",
               w."name" AS "warehouseName",
               w."code" AS "warehouseCode",
               ws."quantity"
        FROM "warehouse_stocks" ws
        JOIN "warehouses" w ON w."id" = ws."warehouseId"
        WHERE ws."workspaceId" = ${workspaceId}::uuid
          AND ws."productId" IN (${Prisma.join(products.map((product) => Prisma.sql`${product.id}::uuid`))})
        ORDER BY w."isDefault" DESC, w."name" ASC, w."id" ASC
      `
    : [];

  const warehouseByProduct = new Map<string, Array<{ warehouseId: string; warehouseName: string; warehouseCode: string; quantity: number }>>();
  for (const row of warehouseRows) {
    const entries = warehouseByProduct.get(row.productId) ?? [];
    entries.push({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      warehouseCode: row.warehouseCode,
      quantity: Number(row.quantity),
    });
    warehouseByProduct.set(row.productId, entries);
  }

  const rows = products
    .filter((product) => !lowStockOnly || product.stockQuantity.toNumber() <= product.reorderLevel.toNumber())
    .map((product) => {
      const stockQuantity = product.stockQuantity.toNumber();
      const warehouses = warehouseByProduct.get(product.id) ?? [];
      const warehouseTotal = warehouses.reduce((sum, warehouse) => sum + warehouse.quantity, 0);
      const warehouseDifference = warehouseMode === "MANAGED"
        ? new Prisma.Decimal(stockQuantity).minus(warehouseTotal).toNumber()
        : null;
      return {
        ...product,
        sku: product.sku ?? "",
        category: product.category ?? "Uncategorized",
        stockQuantity,
        reorderLevel: product.reorderLevel.toNumber(),
        unitCost: Number(product.costPrice),
        stockValue: new Prisma.Decimal(product.stockQuantity).mul(product.costPrice).toNumber(),
        stockStatus: stockQuantity <= 0 ? "Out of Stock" : stockQuantity <= product.reorderLevel.toNumber() ? "Low Stock" : "In Stock",
        warehouses,
        warehouseTotal: warehouseMode === "MANAGED" ? warehouseTotal : null,
        warehouseDifference,
        warehouseInSync: warehouseDifference === null ? null : new Prisma.Decimal(warehouseDifference).isZero(),
      };
    });

  const totalValue = rows.reduce((sum, row) => sum.plus(new Prisma.Decimal(row.stockValue)), new Prisma.Decimal(0)).toNumber();
  const fullScope = !search && !lowStockOnly;
  const gl = fullScope && inventoryAccount ? await db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: inventoryAccount.id }, _sum: { debit: true, credit: true } }) : null;
  const inventoryGlBalance = fullScope ? new Prisma.Decimal(gl?._sum.debit ?? 0).minus(gl?._sum.credit ?? 0).toNumber() : null;
  const warehouseMismatchCount = warehouseMode === "MANAGED" ? rows.filter((row) => row.warehouseInSync === false).length : 0;
  return {
    rows,
    warehouseMode,
    warehouseMismatchCount,
    totalQuantity: rows.reduce((sum, row) => sum + row.stockQuantity, 0),
    totalValue,
    inventoryGlBalance,
    reconciliationDifference: inventoryGlBalance === null ? null : new Prisma.Decimal(totalValue).minus(inventoryGlBalance).toNumber(),
    valuationBasis: "Current Product.costPrice (existing BusinessOS current-cost basis)",
  };
}

export async function getStockMovementReport(workspaceId: string, filters: { from?: Date; to?: Date; productId?: string; type?: string; search?: string } = {}) {
  const { from, to } = statementRange(filters);
  const productWhere = filters.search ? { OR: [{ name: { contains: filters.search, mode: "insensitive" as const } }, { sku: { contains: filters.search, mode: "insensitive" as const } }] } : undefined;
  const where = { workspaceId, ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.type ? { type: filters.type as never } : {}), ...(productWhere ? { product: productWhere } : {}) };
  const [openingRows, movements] = await Promise.all([
    db.inventoryTransaction.groupBy({ by: ["productId"], where: { ...where, createdAt: { lt: from } }, _sum: { quantityChanged: true } }),
    db.inventoryTransaction.findMany({ where: { ...where, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2001, select: { id: true, productId: true, type: true, quantityChanged: true, unitCost: true, reference: true, createdAt: true, product: { select: { name: true, sku: true } } } }),
  ]);
  const truncated = movements.length > 2000;
  const visibleMovements = movements.slice(0, 2000);
  const balances = new Map(openingRows.map((row) => [row.productId, Number(row._sum.quantityChanged ?? 0)]));
  const rows = visibleMovements.map((movement) => {
    const runningQuantity = (balances.get(movement.productId) ?? 0) + Number(movement.quantityChanged);
    balances.set(movement.productId, runningQuantity);
    return { id: movement.id, productId: movement.productId, productName: movement.product.name, sku: movement.product.sku ?? "", date: movement.createdAt.toISOString(), type: movement.type, document: movement.reference ?? "-", quantityIn: Math.max(0, Number(movement.quantityChanged)), quantityOut: Math.max(0, -Number(movement.quantityChanged)), runningQuantity, unitCost: movement.unitCost ? Number(movement.unitCost) : null };
  });
  const transferAudits = await db.auditLog.findMany({
    where: {
      workspaceId,
      action: "warehouse.stock.transferred",
      createdAt: { gte: from, lte: to },
      ...(filters.productId ? { entityId: filters.productId } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 1001,
    select: { id: true, entityId: true, metadata: true, createdAt: true },
  });
  const transfersTruncated = transferAudits.length > 1000;
  const normalizedSearch = filters.search?.trim().toLowerCase();
  const transfers = transferAudits.slice(0, 1000).flatMap((audit) => {
    const metadata = audit.metadata;
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return [];
    const value = metadata as Record<string, unknown>;
    const productId = typeof value.productId === "string" ? value.productId : audit.entityId;
    const productName = typeof value.productName === "string" ? value.productName : "Product";
    const sku = typeof value.sku === "string" ? value.sku : "";
    if (normalizedSearch && !productName.toLowerCase().includes(normalizedSearch) && !sku.toLowerCase().includes(normalizedSearch)) return [];
    const quantity = typeof value.quantity === "number" ? value.quantity : Number(value.quantity ?? 0);
    return [{
      id: audit.id,
      productId,
      productName,
      sku,
      date: audit.createdAt.toISOString(),
      quantity,
      fromWarehouse: {
        id: typeof value.fromWarehouseId === "string" ? value.fromWarehouseId : "",
        name: typeof value.fromWarehouseName === "string" ? value.fromWarehouseName : "Unknown warehouse",
        code: typeof value.fromWarehouseCode === "string" ? value.fromWarehouseCode : "",
      },
      toWarehouse: {
        id: typeof value.toWarehouseId === "string" ? value.toWarehouseId : "",
        name: typeof value.toWarehouseName === "string" ? value.toWarehouseName : "Unknown warehouse",
        code: typeof value.toWarehouseCode === "string" ? value.toWarehouseCode : "",
      },
    }];
  });
  return { from: from.toISOString(), to: to.toISOString(), rows, truncated, transfers, transfersTruncated };
}
