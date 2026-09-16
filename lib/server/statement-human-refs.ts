import "server-only";

import { db } from "@/lib/server/db";
import { getCustomerStatement, getSupplierStatement, type StatementFilters } from "@/lib/server/reports";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Statement = NonNullable<Awaited<ReturnType<typeof getCustomerStatement>>>;

async function replaceInternalReferences(workspaceId: string, statement: Statement | null) {
  if (!statement) return null;

  const ids = Array.from(new Set(statement.entries.map((entry) => entry.documentNo).filter((value) => UUID_RE.test(value))));
  if (ids.length === 0) return statement;

  const [sales, invoices, payments, grns, customerReturns, supplierReturns, creditNotes, debitNotes, customers, suppliers] = await Promise.all([
    db.salesOrder.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, orderNumber: true, invoices: { take: 1, orderBy: { createdAt: "asc" }, select: { invoiceNumber: true } } },
    }),
    db.invoice.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, invoiceNumber: true } }),
    db.payment.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, documentNumber: true, reference: true } }),
    db.goodReceivedNote.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, grnNumber: true } }),
    db.customerReturn.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, number: true } }),
    db.supplierReturn.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, number: true } }),
    db.creditNote.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, number: true } }),
    db.debitNote.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, number: true } }),
    db.customer.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } }),
    db.supplier.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } }),
  ]);

  const refs = new Map<string, string>();
  for (const row of sales) refs.set(row.id, row.invoices[0]?.invoiceNumber ?? row.orderNumber);
  for (const row of invoices) refs.set(row.id, row.invoiceNumber);
  for (const row of payments) refs.set(row.id, row.documentNumber ?? row.reference ?? "Payment");
  for (const row of grns) refs.set(row.id, row.grnNumber);
  for (const row of customerReturns) refs.set(row.id, row.number);
  for (const row of supplierReturns) refs.set(row.id, row.number);
  for (const row of creditNotes) refs.set(row.id, row.number);
  for (const row of debitNotes) refs.set(row.id, row.number);
  for (const row of customers) refs.set(row.id, "Opening Balance");
  for (const row of suppliers) refs.set(row.id, "Opening Balance");

  return {
    ...statement,
    entries: statement.entries.map((entry) => ({
      ...entry,
      // Never expose an unresolved internal UUID in a customer/supplier statement.
      documentNo: refs.get(entry.documentNo) ?? (UUID_RE.test(entry.documentNo) ? "-" : entry.documentNo),
    })),
  };
}

export async function getCustomerStatementForDisplay(workspaceId: string, customerId: string, filters: StatementFilters = {}) {
  return replaceInternalReferences(workspaceId, await getCustomerStatement(workspaceId, customerId, filters));
}

export async function getSupplierStatementForDisplay(workspaceId: string, supplierId: string, filters: StatementFilters = {}) {
  return replaceInternalReferences(workspaceId, await getSupplierStatement(workspaceId, supplierId, filters));
}
