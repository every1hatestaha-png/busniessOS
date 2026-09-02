import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { ageDays, payablesBucket, type PayablesBucket } from "@/lib/server/aging";
import { businessDateKey, businessDayEnd } from "@/lib/server/business-time";

export type { PayablesBucket };

export type PayablesFilters = {
  asOf?: Date;
  supplierId?: string;
  search?: string;
  bucket?: PayablesBucket | "current";
  timeZone?: string;
};

export type AgingItem = {
  purchaseId: string;
  documentNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  originalAmount: number;
  outstandingAmount: number;
  ageDays: number;
  bucket: PayablesBucket | "current";
  dueDate: string | null;
};

export type PayablesBucketTotals = Record<PayablesBucket, number>;

export type SupplierAging = {
  supplierId: string;
  supplierName: string;
  totalOutstanding: number;
  buckets: PayablesBucketTotals;
  oldestAgeDays: number | null;
  items: AgingItem[];
};

export type PayablesAgingReport = {
  asOfDate: string;
  totalOutstanding: number;
  buckets: PayablesBucketTotals & { current: number };
  suppliers: SupplierAging[];
};

export const EMPTY_BUCKETS: PayablesBucketTotals = { "1-30": 0, "31-45": 0, "46-60": 0, "61+": 0 };

function toBucketTotals(): PayablesBucketTotals {
  return { ...EMPTY_BUCKETS };
}

/**
 * Builds the payable aging report from the existing purchase / payment /
 * supplier-return model.
 *
 * Outstanding per purchase = stored balanceAmount, which represents accepted
 * GRN liability minus supplier payments and supplier returns. Ordered-only POs,
 * cancelled purchases, and fully settled purchases are excluded from the active
 * aging report while their historical records remain intact.
 *
 * This is a read-only projection: no ledgers, payments, purchases, or
 * inventory are mutated.
 */
export async function getPayablesAging(
  workspaceId: string,
  filters: PayablesFilters = {},
): Promise<PayablesAgingReport> {
  const timeZone = filters.timeZone ?? "Asia/Karachi";
  const asOf = filters.asOf ?? new Date();
  const asOfDate = businessDateKey(asOf, timeZone);
  const asOfEnd = businessDayEnd(asOf, timeZone);
  const purchases = await db.purchaseOrder.findMany({
    where: { workspaceId, goodsReceivedNotes: { some: { receiptDate: { lte: asOfEnd } } }, OR: [{ cancelledAt: null }, { cancelledAt: { gt: asOfEnd } }], ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
    select: {
      id: true,
      orderNumber: true,
      supplierId: true,
      goodsReceivedNotes: { where: { receiptDate: { lte: asOfEnd } }, orderBy: { receiptDate: "asc" }, select: { receiptDate: true, totalAmount: true } },
      paymentAllocations: { where: { payment: { paymentDate: { lte: asOfEnd }, OR: [{ isReversed: false }, { reversedAt: { gt: asOfEnd } }] } }, select: { amount: true } },
      returns: { where: { date: { lte: asOfEnd } }, select: { totalAmount: true } },
      supplier: { select: { name: true, companyName: true } },
    },
  });

  const isMatch =
    filters.search && filters.search.trim().length > 0
      ? (name: string) => name.toLowerCase().includes(filters.search!.trim().toLowerCase())
      : () => true;

  const items: AgingItem[] = [];
  for (const purchase of purchases) {
    const originalAmount = purchase.goodsReceivedNotes.reduce((sum, grn) => sum.plus(grn.totalAmount), new Prisma.Decimal(0)).toNumber();
    const paidAmount = purchase.paymentAllocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0)).toNumber();
    const returnedAmount = purchase.returns.reduce((sum, supplierReturn) => sum.plus(supplierReturn.totalAmount), new Prisma.Decimal(0)).toNumber();
    const outstanding = new Prisma.Decimal(originalAmount).minus(paidAmount).minus(returnedAmount).toNumber();
    if (outstanding <= 0) continue;
    const liabilityDate = purchase.goodsReceivedNotes[0].receiptDate;
    const age = ageDays(liabilityDate, asOf, timeZone);
    const bucket = payablesBucket(age);
    const supplierName = purchase.supplier.companyName ?? purchase.supplier.name;
    if (!isMatch(supplierName)) continue;
    if (filters.bucket && bucket !== filters.bucket) continue;
    items.push({
      purchaseId: purchase.id,
      documentNumber: purchase.orderNumber,
      supplierId: purchase.supplierId,
      supplierName,
      purchaseDate: liabilityDate.toISOString(),
      originalAmount,
      outstandingAmount: outstanding,
      ageDays: age,
      bucket,
      dueDate: null,
    });
  }

  const suppliers = new Map<string, SupplierAging>();
  for (const item of items) {
    let supplier = suppliers.get(item.supplierId);
    if (!supplier) {
      supplier = {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        totalOutstanding: 0,
        buckets: toBucketTotals(),
        oldestAgeDays: null,
        items: [],
      };
      suppliers.set(item.supplierId, supplier);
    }
    supplier.totalOutstanding = new Prisma.Decimal(supplier.totalOutstanding).plus(item.outstandingAmount).toNumber();
    if (item.bucket !== "current") supplier.buckets[item.bucket] = new Prisma.Decimal(supplier.buckets[item.bucket]).plus(item.outstandingAmount).toNumber();
    supplier.items.push(item);
    supplier.oldestAgeDays = supplier.oldestAgeDays === null ? item.ageDays : Math.max(supplier.oldestAgeDays, item.ageDays);
  }

  const supplierRows = [...suppliers.values()].map((supplier) => ({
    ...supplier,
    items: supplier.items.sort((a, b) => b.ageDays - a.ageDays),
  }));

  const totals = { current: 0, ...toBucketTotals() };
  let totalOutstanding = new Prisma.Decimal(0);
  for (const supplier of supplierRows) {
    totalOutstanding = totalOutstanding.plus(supplier.totalOutstanding);
    for (const bucket of Object.keys(supplier.buckets) as PayablesBucket[]) totals[bucket] = new Prisma.Decimal(totals[bucket]).plus(supplier.buckets[bucket]).toNumber();
    totals.current = new Prisma.Decimal(totals.current).plus(supplier.items.filter((item) => item.bucket === "current").reduce((sum, item) => sum + item.outstandingAmount, 0)).toNumber();
  }

  return {
    asOfDate,
    totalOutstanding: totalOutstanding.toNumber(),
    buckets: totals,
    suppliers: supplierRows,
  };
}

/**
 * Lightweight total payables summary (one row per supplier, no per-purchase
 * items). Suitable for dashboards that only need totals without the cost of a
 * full aging-detail report.
 */
export async function getPayablesSummary(workspaceId: string, filters: PayablesFilters = {}) {
  const report = await getPayablesAging(workspaceId, filters);
  return {
    asOfDate: report.asOfDate,
    totalOutstanding: report.totalOutstanding,
    buckets: report.buckets,
    suppliers: report.suppliers.map((supplier) => ({
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      totalOutstanding: supplier.totalOutstanding,
      buckets: supplier.buckets,
      oldestAgeDays: supplier.oldestAgeDays,
    })),
  };
}
