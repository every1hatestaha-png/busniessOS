import "server-only";

import { db } from "@/lib/server/db";
import { businessDayEnd, businessDayStart, businessMonthStart } from "@/lib/server/business-time";
import { Prisma } from "@prisma/client";

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
      select: { id: true, date: true, type: true, referenceId: true, description: true, debit: true, credit: true },
    }),
  ]);
  let runningBalance = Number(opening._sum.debit ?? 0) - Number(opening._sum.credit ?? 0);
  const allEntries: StatementEntry[] = rows.map((row) => {
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
      select: { id: true, date: true, type: true, referenceId: true, description: true, debit: true, credit: true },
    }),
  ]);
  let runningBalance = Number(opening._sum.credit ?? 0) - Number(opening._sum.debit ?? 0);
  const allEntries: StatementEntry[] = rows.map((row) => {
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
  const [products, inventoryAccount] = await Promise.all([
    db.product.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" }, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }, { category: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sku: true, category: true, stockQuantity: true, costPrice: true, reorderLevel: true, unit: true, status: true },
    }),
    db.account.findUnique({ where: { workspaceId_systemCode: { workspaceId, systemCode: "INVENTORY" } }, select: { id: true } }),
  ]);
  const rows = products.filter((product) => !lowStockOnly || product.stockQuantity.toNumber() <= product.reorderLevel.toNumber()).map((product) => ({ ...product, sku: product.sku ?? "", category: product.category ?? "Uncategorized", stockQuantity: product.stockQuantity.toNumber(), reorderLevel: product.reorderLevel.toNumber(), unitCost: Number(product.costPrice), stockValue: new Prisma.Decimal(product.stockQuantity).mul(product.costPrice).toNumber(), stockStatus: product.stockQuantity.toNumber() <= 0 ? "Out of Stock" : product.stockQuantity.toNumber() <= product.reorderLevel.toNumber() ? "Low Stock" : "In Stock" }));
  const totalValue = rows.reduce((sum, row) => sum.plus(new Prisma.Decimal(row.stockValue)), new Prisma.Decimal(0)).toNumber();
  const fullScope = !search && !lowStockOnly;
  const gl = fullScope && inventoryAccount ? await db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: inventoryAccount.id }, _sum: { debit: true, credit: true } }) : null;
  const inventoryGlBalance = fullScope ? new Prisma.Decimal(gl?._sum.debit ?? 0).minus(gl?._sum.credit ?? 0).toNumber() : null;
  return { rows, totalQuantity: rows.reduce((sum, row) => sum + row.stockQuantity, 0), totalValue, inventoryGlBalance, reconciliationDifference: inventoryGlBalance === null ? null : new Prisma.Decimal(totalValue).minus(inventoryGlBalance).toNumber(), valuationBasis: "Current Product.costPrice (existing BusinessOS current-cost basis)" };
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
  return { from: from.toISOString(), to: to.toISOString(), rows, truncated };
}
