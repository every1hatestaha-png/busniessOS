import "server-only";

import { Prisma } from "@prisma/client";

import { businessDayEnd, businessDayStart } from "@/lib/server/business-time";
import { listCollectionPromises } from "@/lib/server/collection-promises";
import { db } from "@/lib/server/db";
import { getPayablesSummary } from "@/lib/server/payables";
import { getSmartCollections } from "@/lib/server/smart-collections";

export type DailyActionItem = {
  id: string;
  tone: "danger" | "warning" | "info" | "neutral";
  title: string;
  detail: string;
  amount?: number;
  href: string;
  actionLabel: string;
};

export type DailyActionCenter = {
  actionCount: number;
  todaySales: number;
  todayReceipts: number;
  collectionAmount: number;
  promiseDueAmount: number;
  promiseMissedAmount: number;
  lowStockCount: number;
  supplierReviewAmount: number;
  items: DailyActionItem[];
};

export async function getDailyActionCenter(
  workspaceId: string,
  options: { canViewFinancials: boolean; timeZone?: string } = { canViewFinancials: false },
): Promise<DailyActionCenter> {
  const timeZone = options.timeZone ?? "Asia/Karachi";
  const now = new Date();
  const dayStart = businessDayStart(now, timeZone);
  const dayEnd = businessDayEnd(now, timeZone);

  const [lowStockRows, lowStockCount, todaySalesAggregate, todayReceiptAggregate] = await Promise.all([
    db.product.findMany({
      where: { workspaceId, status: "ACTIVE", stockQuantity: { lte: db.product.fields.reorderLevel } },
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
      take: 3,
      select: { id: true, name: true, sku: true, stockQuantity: true, reorderLevel: true, unit: true },
    }),
    db.product.count({ where: { workspaceId, status: "ACTIVE", stockQuantity: { lte: db.product.fields.reorderLevel } } }),
    db.salesOrder.aggregate({
      where: { workspaceId, status: { not: "CANCELLED" }, orderDate: { gte: dayStart, lte: dayEnd } },
      _sum: { total: true },
    }),
    options.canViewFinancials
      ? db.payment.aggregate({
          where: { workspaceId, customerId: { not: null }, isReversed: false, reversalOfId: null, paymentDate: { gte: dayStart, lte: dayEnd } },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
  ]);

  const items: DailyActionItem[] = [];
  for (const product of lowStockRows) {
    items.push({
      id: `stock-${product.id}`,
      tone: product.stockQuantity.lte(0) ? "danger" : "warning",
      title: `${product.name} needs stock attention`,
      detail: `${product.stockQuantity.toString()} ${product.unit.toLowerCase()} available · reorder level ${product.reorderLevel.toString()}`,
      href: `/inventory/${product.id}`,
      actionLabel: "Review stock",
    });
  }
  if (lowStockCount > lowStockRows.length) {
    items.push({ id: "stock-more", tone: "warning", title: `${lowStockCount - lowStockRows.length} more products need stock attention`, detail: "Open the low-stock report to review the remaining items.", href: "/reports/current-stock?lowStock=true", actionLabel: "Open stock report" });
  }

  let collectionAmount = 0;
  let promiseDueAmount = 0;
  let promiseMissedAmount = 0;
  let supplierReviewAmount = 0;

  if (options.canViewFinancials) {
    const [collections, promises, payables] = await Promise.all([
      getSmartCollections(workspaceId, timeZone),
      listCollectionPromises(workspaceId, { status: "PENDING", timeZone }),
      getPayablesSummary(workspaceId, { timeZone }),
    ]);

    collectionAmount = collections.summary.dueNow;
    if (collections.summary.contactCount > 0) {
      items.unshift({
        id: "collections",
        tone: collections.summary.criticalCount > 0 ? "danger" : "warning",
        title: `${collections.summary.contactCount} customer${collections.summary.contactCount === 1 ? "" : "s"} need collection follow-up`,
        detail: `${collections.summary.criticalCount ? `${collections.summary.criticalCount} urgent · ` : ""}Open Smart Collections to prepare reviewed WhatsApp reminders.`,
        amount: collections.summary.dueNow,
        href: "/collections",
        actionLabel: "Start collections",
      });
    }

    const dueToday = promises.filter((promise) => promise.timing === "TODAY");
    const missed = promises.filter((promise) => promise.timing === "MISSED");
    promiseDueAmount = dueToday.reduce((sum, promise) => new Prisma.Decimal(sum).plus(promise.amount).toNumber(), 0);
    promiseMissedAmount = missed.reduce((sum, promise) => new Prisma.Decimal(sum).plus(promise.amount).toNumber(), 0);

    if (missed.length) {
      items.unshift({
        id: "promises-missed",
        tone: "danger",
        title: `${missed.length} payment promise${missed.length === 1 ? "" : "s"} missed`,
        detail: `${missed[0].customerName}${missed.length > 1 ? ` + ${missed.length - 1} more` : ""} need follow-up. No payment is recorded automatically from a promise.`,
        amount: promiseMissedAmount,
        href: "/collections",
        actionLabel: "Follow up now",
      });
    }
    if (dueToday.length) {
      items.unshift({
        id: "promises-today",
        tone: "warning",
        title: `${dueToday.length} payment promise${dueToday.length === 1 ? "" : "s"} due today`,
        detail: `${dueToday[0].customerName}${dueToday.length > 1 ? ` + ${dueToday.length - 1} more` : ""} committed payment for today.`,
        amount: promiseDueAmount,
        href: "/collections",
        actionLabel: "Review promises",
      });
    }

    const agedSuppliers = payables.suppliers.filter((supplier) => (supplier.oldestAgeDays ?? 0) >= 30 && supplier.totalOutstanding > 0);
    supplierReviewAmount = agedSuppliers.reduce((sum, supplier) => new Prisma.Decimal(sum).plus(supplier.totalOutstanding).toNumber(), 0);
    if (agedSuppliers.length) {
      items.push({
        id: "supplier-review",
        tone: "neutral",
        title: `${agedSuppliers.length} supplier balance${agedSuppliers.length === 1 ? "" : "s"} are 30+ days old`,
        detail: "Age is measured from the GRN liability date; MunshiOS does not assume contractual supplier due terms.",
        amount: supplierReviewAmount,
        href: "/payables",
        actionLabel: "Review payables",
      });
    }
  }

  return {
    actionCount: items.length,
    todaySales: Number(todaySalesAggregate._sum.total ?? 0),
    todayReceipts: Number(todayReceiptAggregate._sum.amount ?? 0),
    collectionAmount,
    promiseDueAmount,
    promiseMissedAmount,
    lowStockCount,
    supplierReviewAmount,
    items: items.slice(0, 8),
  };
}
