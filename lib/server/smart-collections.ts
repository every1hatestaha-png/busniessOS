import "server-only";

import { applyActivePromise, buildSmartCollectionRows, summarizeSmartCollections } from "@/lib/smart-collections";
import { getPendingPromisesByCustomer } from "@/lib/server/collection-promises";
import { listCustomers } from "@/lib/server/customers";
import { getReceivablesAging } from "@/lib/server/receivables";

export async function getSmartCollections(workspaceId: string, timeZone = "Asia/Karachi") {
  const [customers, aging, promisesByCustomer] = await Promise.all([
    listCustomers(workspaceId),
    getReceivablesAging(workspaceId, { timeZone }),
    getPendingPromisesByCustomer(workspaceId, timeZone),
  ]);

  const agingByCustomer = new Map(aging.customers.map((customer) => [customer.customerId, customer]));
  const baseRows = buildSmartCollectionRows(customers.map((customer) => {
    const customerAging = agingByCustomer.get(customer.id);
    return {
      customerId: customer.id,
      customerName: customer.companyName || customer.name,
      phone: customer.phone,
      creditDays: customer.creditDays,
      currentBalance: customer.currentBalance,
      oldestAgeDays: customerAging?.oldestAgeDays ?? null,
      items: customerAging?.items.map((item) => ({
        documentNumber: item.documentNumber,
        outstandingAmount: item.outstandingAmount,
        ageDays: item.ageDays,
        isOpeningBalance: item.isOpeningBalance,
      })) ?? [],
    };
  }));

  const rows = baseRows.map((row) => {
    const promise = promisesByCustomer.get(row.customerId);
    return applyActivePromise(row, promise ? {
      id: promise.id,
      amount: promise.amount,
      promiseDate: promise.promiseDate,
      timing: promise.timing as "MISSED" | "TODAY" | "UPCOMING",
      daysLate: promise.daysLate,
      note: promise.note,
    } : null);
  });

  rows.sort((a, b) => {
    const promiseRank = (row: typeof a) => row.activePromise?.timing === "MISSED" ? 0 : row.activePromise?.timing === "TODAY" ? 1 : row.priority === "URGENT" ? 2 : row.priority === "HIGH" ? 3 : row.priority === "NORMAL" ? 4 : row.priority === "REVIEW" ? 5 : 6;
    return promiseRank(a) - promiseRank(b) || b.currentBalance - a.currentBalance;
  });

  return {
    asOfDate: aging.asOfDate,
    rows,
    summary: summarizeSmartCollections(rows),
  };
}
