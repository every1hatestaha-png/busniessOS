import "server-only";

import { db } from "@/lib/server/db";
import { ageDays, payablesBucket, type PayablesBucket } from "@/lib/server/aging";

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
  buckets: PayablesBucketTotals;
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
  const asOfDate = toDateKey(asOf, timeZone);

  const purchases = await db.purchaseOrder.findMany({
    where: { workspaceId, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] }, balanceAmount: { gt: 0 }, ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
    select: {
      id: true,
      orderNumber: true,
      supplierId: true,
      orderDate: true,
      totalAmount: true,
      balanceAmount: true,
      supplier: { select: { name: true, companyName: true } },
    },
  });

  const isMatch =
    filters.search && filters.search.trim().length > 0
      ? (name: string) => name.toLowerCase().includes(filters.search!.trim().toLowerCase())
      : () => true;

  const items: AgingItem[] = [];
  for (const purchase of purchases) {
    const outstanding = Number(purchase.balanceAmount);
    if (outstanding <= 0) continue;
    const age = ageDays(purchase.orderDate, asOf, timeZone);
    const bucket = payablesBucket(age);
    const supplierName = purchase.supplier.companyName ?? purchase.supplier.name;
    if (!isMatch(supplierName)) continue;
    if (filters.bucket && bucket !== filters.bucket) continue;
    items.push({
      purchaseId: purchase.id,
      documentNumber: purchase.orderNumber,
      supplierId: purchase.supplierId,
      supplierName,
      purchaseDate: purchase.orderDate.toISOString(),
      originalAmount: Number(purchase.totalAmount),
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
    supplier.totalOutstanding += item.outstandingAmount;
    if (item.bucket !== "current") supplier.buckets[item.bucket] += item.outstandingAmount;
    supplier.items.push(item);
    supplier.oldestAgeDays = supplier.oldestAgeDays === null ? item.ageDays : Math.max(supplier.oldestAgeDays, item.ageDays);
  }

  const supplierRows = [...suppliers.values()].map((supplier) => ({
    ...supplier,
    items: supplier.items.sort((a, b) => b.ageDays - a.ageDays),
  }));

  const totals = toBucketTotals();
  let totalOutstanding = 0;
  for (const supplier of supplierRows) {
    totalOutstanding += supplier.totalOutstanding;
    for (const bucket of Object.keys(totals) as PayablesBucket[]) {
      totals[bucket] += supplier.buckets[bucket];
    }
  }

  return {
    asOfDate,
    totalOutstanding,
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

function toDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
