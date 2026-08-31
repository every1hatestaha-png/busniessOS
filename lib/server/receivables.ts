import "server-only";

import { db } from "@/lib/server/db";
import { ageDays, receivablesBucket, type ReceivablesBucket } from "@/lib/server/aging";
import { businessDateKey, businessDayEnd } from "@/lib/server/business-time";

export type { ReceivablesBucket };

export type ReceivablesFilters = {
  asOf?: Date;
  customerId?: string;
  search?: string;
  bucket?: ReceivablesBucket | "current";
  timeZone?: string;
};

export type ReceivablesAgingItem = {
  invoiceId: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string | null;
  originalAmount: number;
  paymentsApplied: number;
  creditsApplied: number;
  outstandingAmount: number;
  ageDays: number;
  bucket: ReceivablesBucket | "current";
  isOpeningBalance?: boolean;
};

export type CustomerReceivablesAging = {
  customerId: string;
  customerName: string;
  totalOutstanding: number;
  unappliedCredit: number;
  unappliedPayment: number;
  buckets: ReceivablesBucketTotals;
  oldestAgeDays: number | null;
  items: ReceivablesAgingItem[];
};

export type ReceivablesBucketTotals = Record<ReceivablesBucket, number>;

export type ReceivablesAgingReport = {
  asOfDate: string;
  grossOutstanding: number;
  totalOutstanding: number;
  totalUnappliedCredit: number;
  totalUnappliedPayments: number;
  buckets: ReceivablesBucketTotals & { current: number };
  customers: CustomerReceivablesAging[];
};

export const EMPTY_RECEIVABLES_BUCKETS: ReceivablesBucketTotals = { "1-30": 0, "31-45": 0, "46-60": 0, "61+": 0 };

function toBucketTotals(): ReceivablesBucketTotals {
  return { ...EMPTY_RECEIVABLES_BUCKETS };
}

export async function getReceivablesAging(workspaceId: string, filters: ReceivablesFilters = {}): Promise<ReceivablesAgingReport> {
  const timeZone = filters.timeZone ?? "Asia/Karachi";
  const asOf = filters.asOf ?? new Date();
  const asOfDate = businessDateKey(asOf, timeZone);
  const asOfEnd = businessDayEnd(asOf, timeZone);
  const search = filters.search?.trim().toLowerCase();

  const [invoices, credits, onAccountPayments, openingBalances] = await Promise.all([
    db.invoice.findMany({
      where: { workspaceId, status: { not: "DRAFT" }, issuedAt: { lte: asOfEnd }, OR: [{ status: { not: "CANCELLED" } }, { salesOrder: { cancelledAt: { gt: asOfEnd } } }], ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        issuedAt: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
        creditApplied: true,
        customer: { select: { name: true, companyName: true } },
        allocations: { where: { payment: { paymentDate: { lte: asOfEnd }, OR: [{ isReversed: false }, { reversedAt: { gt: asOfEnd } }] } }, select: { amount: true } },
        payments: { where: { paymentDate: { lte: asOfEnd }, allocations: { none: {} }, OR: [{ isReversed: false }, { reversedAt: { gt: asOfEnd } }] }, select: { amount: true } },
        creditAllocations: { where: { createdAt: { lte: asOfEnd } }, select: { amount: true } },
      },
    }),
    db.creditNote.findMany({
      where: { workspaceId, status: { not: "CANCELLED" }, date: { lte: asOfEnd }, ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { customerId: true, amount: true, allocations: { where: { createdAt: { lte: asOfEnd } }, select: { amount: true } }, customer: { select: { name: true, companyName: true } } },
    }),
    db.payment.findMany({
      where: { workspaceId, customerId: { not: null }, invoiceId: null, reversalOfId: null, paymentDate: { lte: asOfEnd }, OR: [{ isReversed: false }, { reversedAt: { gt: asOfEnd } }], ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { customerId: true, amount: true, allocations: { where: { createdAt: { lte: asOfEnd } }, select: { amount: true } }, customer: { select: { name: true, companyName: true } } },
    }),
    db.ledgerEntry.findMany({
      where: { workspaceId, customerId: { not: null }, type: "OPENING_BALANCE", date: { lte: asOfEnd }, ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { id: true, customerId: true, date: true, debit: true, credit: true, customer: { select: { name: true, companyName: true } } },
    }),
  ]);

  const unappliedCreditByCustomer = new Map<string, { amount: number; customerName: string }>();
  for (const credit of credits) {
    const remainingAmount = Number(credit.amount) - credit.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    if (remainingAmount <= 0) continue;
    const current = unappliedCreditByCustomer.get(credit.customerId);
    unappliedCreditByCustomer.set(credit.customerId, { amount: (current?.amount ?? 0) + remainingAmount, customerName: current?.customerName ?? credit.customer.companyName ?? credit.customer.name });
  }
  const unappliedPaymentByCustomer = new Map<string, { amount: number; customerName: string }>();
  for (const payment of onAccountPayments) {
    if (!payment.customerId || !payment.customer) continue;
    const unappliedAmount = Number(payment.amount) - payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    if (unappliedAmount <= 0) continue;
    const current = unappliedPaymentByCustomer.get(payment.customerId);
    unappliedPaymentByCustomer.set(payment.customerId, { amount: (current?.amount ?? 0) + unappliedAmount, customerName: current?.customerName ?? payment.customer.companyName ?? payment.customer.name });
  }
  const items: ReceivablesAgingItem[] = [];
  for (const opening of openingBalances) {
    if (!opening.customerId || !opening.customer) continue;
    const outstanding = Number(opening.debit) - Number(opening.credit);
    if (outstanding <= 0) continue;
    const customerName = opening.customer.companyName ?? opening.customer.name;
    if (search && !customerName.toLowerCase().includes(search) && !"opening balance".includes(search)) continue;
    const age = ageDays(opening.date, asOf, timeZone);
    const bucket = receivablesBucket(age);
    if (filters.bucket && bucket !== filters.bucket) continue;
    items.push({ invoiceId: opening.id, documentNumber: "OPENING BALANCE", customerId: opening.customerId, customerName, invoiceDate: opening.date.toISOString(), dueDate: null, originalAmount: outstanding, paymentsApplied: 0, creditsApplied: 0, outstandingAmount: outstanding, ageDays: age, bucket, isOpeningBalance: true });
  }
  for (const invoice of invoices) {
    const paymentsApplied = invoice.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
      + invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const creditsApplied = invoice.creditAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const outstanding = Number(invoice.amount) - paymentsApplied - creditsApplied;
    if (outstanding <= 0) continue;
    const customerName = invoice.customer.companyName ?? invoice.customer.name;
    if (search && !customerName.toLowerCase().includes(search) && !invoice.invoiceNumber.toLowerCase().includes(search)) continue;
    // BusinessOS does not yet persist explicit customer credit terms. Age from
    // the invoice date and do not present the auto-populated due date as a
    // contractual payment term.
    const age = ageDays(invoice.issuedAt, asOf, timeZone);
    const bucket = receivablesBucket(age);
    if (filters.bucket && bucket !== filters.bucket) continue;
    items.push({
      invoiceId: invoice.id,
      documentNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName,
      invoiceDate: invoice.issuedAt.toISOString(),
      dueDate: null,
      originalAmount: Number(invoice.amount),
      paymentsApplied,
      creditsApplied,
      outstandingAmount: outstanding,
      ageDays: age,
      bucket,
    });
  }

  const customers = new Map<string, CustomerReceivablesAging>();
  for (const item of items) {
    let customer = customers.get(item.customerId);
    if (!customer) {
      customer = { customerId: item.customerId, customerName: item.customerName, totalOutstanding: 0, unappliedCredit: unappliedCreditByCustomer.get(item.customerId)?.amount ?? 0, unappliedPayment: unappliedPaymentByCustomer.get(item.customerId)?.amount ?? 0, buckets: toBucketTotals(), oldestAgeDays: null, items: [] };
      customers.set(item.customerId, customer);
    }
    customer.totalOutstanding += item.outstandingAmount;
    if (item.bucket !== "current") customer.buckets[item.bucket] += item.outstandingAmount;
    customer.items.push(item);
    customer.oldestAgeDays = customer.oldestAgeDays === null ? item.ageDays : Math.max(customer.oldestAgeDays, item.ageDays);
  }

  for (const [customerId, credit] of unappliedCreditByCustomer) {
    if (!customers.has(customerId) && !filters.bucket && (!search || credit.customerName.toLowerCase().includes(search))) {
      customers.set(customerId, { customerId, customerName: credit.customerName, totalOutstanding: 0, unappliedCredit: credit.amount, unappliedPayment: unappliedPaymentByCustomer.get(customerId)?.amount ?? 0, buckets: toBucketTotals(), oldestAgeDays: null, items: [] });
    }
  }

  for (const [customerId, payment] of unappliedPaymentByCustomer) {
    if (!customers.has(customerId) && !filters.bucket && (!search || payment.customerName.toLowerCase().includes(search))) {
      customers.set(customerId, { customerId, customerName: payment.customerName, totalOutstanding: 0, unappliedCredit: unappliedCreditByCustomer.get(customerId)?.amount ?? 0, unappliedPayment: payment.amount, buckets: toBucketTotals(), oldestAgeDays: null, items: [] });
    }
  }

  const totals = { current: 0, ...toBucketTotals() };
  let grossOutstanding = 0;
  let totalUnappliedCredit = 0;
  let totalUnappliedPayments = 0;
  const customerRows = [...customers.values()].map((customer) => ({ ...customer, items: customer.items.sort((a, b) => b.ageDays - a.ageDays) }));
  for (const customer of customerRows) {
    grossOutstanding += customer.totalOutstanding;
    totalUnappliedCredit += customer.unappliedCredit;
    totalUnappliedPayments += customer.unappliedPayment;
    for (const bucket of Object.keys(customer.buckets) as ReceivablesBucket[]) totals[bucket] += customer.buckets[bucket];
    totals.current += customer.items.filter((item) => item.bucket === "current").reduce((sum, item) => sum + item.outstandingAmount, 0);
  }

  return { asOfDate, grossOutstanding, totalOutstanding: grossOutstanding - totalUnappliedCredit - totalUnappliedPayments, totalUnappliedCredit, totalUnappliedPayments, buckets: totals, customers: customerRows };
}
