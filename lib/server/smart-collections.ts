import "server-only";

import { buildSmartCollectionRows, summarizeSmartCollections } from "@/lib/smart-collections";
import { listCustomers } from "@/lib/server/customers";
import { getReceivablesAging } from "@/lib/server/receivables";

export async function getSmartCollections(workspaceId: string, timeZone = "Asia/Karachi") {
  const [customers, aging] = await Promise.all([
    listCustomers(workspaceId),
    getReceivablesAging(workspaceId, { timeZone }),
  ]);

  const agingByCustomer = new Map(aging.customers.map((customer) => [customer.customerId, customer]));
  const rows = buildSmartCollectionRows(customers.map((customer) => {
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

  return {
    asOfDate: aging.asOfDate,
    rows,
    summary: summarizeSmartCollections(rows),
  };
}
