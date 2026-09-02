import "server-only";

import { Prisma } from "@prisma/client";
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

  const customerFilter = filters.customerId ? Prisma.sql`AND c."id" = ${filters.customerId}` : Prisma.empty;
  const invoiceCustomerFilter = filters.customerId ? Prisma.sql`AND i."customerId" = ${filters.customerId}` : Prisma.empty;
  const [invoices, credits, onAccountPayments, openingBalances] = await Promise.all([
    db.$queryRaw<Array<{ id: string; invoiceNumber: string; customerId: string; issuedAt: Date; dueDate: Date | null; amount: Prisma.Decimal; paymentsApplied: Prisma.Decimal; creditsApplied: Prisma.Decimal; customerName: string }>>`
      SELECT i."id", i."invoiceNumber", i."customerId", i."issuedAt", i."dueDate", i."amount",
        COALESCE(pa.total, 0) + COALESCE(ip.total, 0) AS "paymentsApplied",
        COALESCE(ca.total, 0) AS "creditsApplied",
        COALESCE(c."companyName", c."name") AS "customerName"
      FROM "invoices" i
      INNER JOIN "customers" c ON c."id" = i."customerId"
      LEFT JOIN "sales_orders" so ON so."id" = i."salesOrderId"
      LEFT JOIN (
        SELECT a."invoiceId", SUM(a."amount") AS total
        FROM "payment_allocations" a
        INNER JOIN "payments" p ON p."id" = a."paymentId"
        WHERE a."workspaceId" = ${workspaceId}
          AND p."paymentDate" <= ${asOfEnd}
          AND (p."isReversed" = false OR p."reversedAt" > ${asOfEnd})
        GROUP BY a."invoiceId"
      ) pa ON pa."invoiceId" = i."id"
      LEFT JOIN (
        SELECT p."invoiceId", SUM(p."amount") AS total
        FROM "payments" p
        WHERE p."workspaceId" = ${workspaceId}
          AND p."invoiceId" IS NOT NULL
          AND p."paymentDate" <= ${asOfEnd}
          AND (p."isReversed" = false OR p."reversedAt" > ${asOfEnd})
          AND NOT EXISTS (SELECT 1 FROM "payment_allocations" a WHERE a."paymentId" = p."id")
        GROUP BY p."invoiceId"
      ) ip ON ip."invoiceId" = i."id"
      LEFT JOIN (
        SELECT "invoiceId", SUM("amount") AS total
        FROM "customer_credit_allocations"
        WHERE "workspaceId" = ${workspaceId} AND "createdAt" <= ${asOfEnd}
        GROUP BY "invoiceId"
      ) ca ON ca."invoiceId" = i."id"
      WHERE i."workspaceId" = ${workspaceId}
        AND i."status" <> 'DRAFT'
        AND i."issuedAt" <= ${asOfEnd}
        AND (i."status" <> 'CANCELLED' OR so."cancelledAt" > ${asOfEnd})
        ${invoiceCustomerFilter}
    `,
    db.$queryRaw<Array<{ customerId: string; amount: Prisma.Decimal; appliedAmount: Prisma.Decimal; customerName: string }>>`
      SELECT cn."customerId", cn."amount", COALESCE(ca.total, 0) AS "appliedAmount", COALESCE(c."companyName", c."name") AS "customerName"
      FROM "credit_notes" cn
      INNER JOIN "customers" c ON c."id" = cn."customerId"
      LEFT JOIN (
        SELECT "creditNoteId", SUM("amount") AS total
        FROM "customer_credit_allocations"
        WHERE "workspaceId" = ${workspaceId} AND "createdAt" <= ${asOfEnd}
        GROUP BY "creditNoteId"
      ) ca ON ca."creditNoteId" = cn."id"
      WHERE cn."workspaceId" = ${workspaceId}
        AND cn."status" <> 'CANCELLED'
        AND cn."date" <= ${asOfEnd}
        ${customerFilter}
    `,
    db.$queryRaw<Array<{ customerId: string; amount: Prisma.Decimal; allocatedAmount: Prisma.Decimal; customerName: string }>>`
      SELECT p."customerId", p."amount", COALESCE(pa.total, 0) AS "allocatedAmount", COALESCE(c."companyName", c."name") AS "customerName"
      FROM "payments" p
      INNER JOIN "customers" c ON c."id" = p."customerId"
      LEFT JOIN (
        SELECT "paymentId", SUM("amount") AS total
        FROM "payment_allocations"
        WHERE "workspaceId" = ${workspaceId} AND "createdAt" <= ${asOfEnd}
        GROUP BY "paymentId"
      ) pa ON pa."paymentId" = p."id"
      WHERE p."workspaceId" = ${workspaceId}
        AND p."customerId" IS NOT NULL
        AND p."invoiceId" IS NULL
        AND p."reversalOfId" IS NULL
        AND p."paymentDate" <= ${asOfEnd}
        AND (p."isReversed" = false OR p."reversedAt" > ${asOfEnd})
        ${customerFilter}
    `,
    db.$queryRaw<Array<{ id: string; customerId: string; date: Date; debit: Prisma.Decimal; credit: Prisma.Decimal; customerName: string }>>`
      SELECT le."id", le."customerId", le."date", le."debit", le."credit", COALESCE(c."companyName", c."name") AS "customerName"
      FROM "ledger_entries" le
      INNER JOIN "customers" c ON c."id" = le."customerId"
      WHERE le."workspaceId" = ${workspaceId}
        AND le."customerId" IS NOT NULL
        AND le."type" = 'OPENING_BALANCE'
        AND le."date" <= ${asOfEnd}
        ${customerFilter}
    `,
  ]);

  const unappliedCreditByCustomer = new Map<string, { amount: number; customerName: string }>();
  for (const credit of credits) {
    const remainingAmount = credit.amount.minus(credit.appliedAmount);
    if (remainingAmount.lte(0)) continue;
    const current = unappliedCreditByCustomer.get(credit.customerId);
    unappliedCreditByCustomer.set(credit.customerId, { amount: new Prisma.Decimal(current?.amount ?? 0).plus(remainingAmount).toNumber(), customerName: current?.customerName ?? credit.customerName });
  }
  const unappliedPaymentByCustomer = new Map<string, { amount: number; customerName: string }>();
  for (const payment of onAccountPayments) {
    if (!payment.customerId) continue;
    const unappliedAmount = payment.amount.minus(payment.allocatedAmount);
    if (unappliedAmount.lte(0)) continue;
    const current = unappliedPaymentByCustomer.get(payment.customerId);
    unappliedPaymentByCustomer.set(payment.customerId, { amount: new Prisma.Decimal(current?.amount ?? 0).plus(unappliedAmount).toNumber(), customerName: current?.customerName ?? payment.customerName });
  }
  const items: ReceivablesAgingItem[] = [];
  for (const opening of openingBalances) {
    if (!opening.customerId) continue;
    const outstanding = opening.debit.minus(opening.credit).toNumber();
    if (outstanding <= 0) continue;
    const customerName = opening.customerName;
    if (search && !customerName.toLowerCase().includes(search) && !"opening balance".includes(search)) continue;
    const age = ageDays(opening.date, asOf, timeZone);
    const bucket = receivablesBucket(age);
    if (filters.bucket && bucket !== filters.bucket) continue;
    items.push({ invoiceId: opening.id, documentNumber: "OPENING BALANCE", customerId: opening.customerId, customerName, invoiceDate: opening.date.toISOString(), dueDate: null, originalAmount: outstanding, paymentsApplied: 0, creditsApplied: 0, outstandingAmount: outstanding, ageDays: age, bucket, isOpeningBalance: true });
  }
  for (const invoice of invoices) {
    const paymentsApplied = invoice.paymentsApplied.toNumber();
    const creditsApplied = invoice.creditsApplied.toNumber();
    const outstanding = invoice.amount.minus(invoice.paymentsApplied).minus(invoice.creditsApplied).toNumber();
    if (outstanding <= 0) continue;
    const customerName = invoice.customerName;
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
    customer.totalOutstanding = new Prisma.Decimal(customer.totalOutstanding).plus(item.outstandingAmount).toNumber();
    if (item.bucket !== "current") customer.buckets[item.bucket] = new Prisma.Decimal(customer.buckets[item.bucket]).plus(item.outstandingAmount).toNumber();
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
  let grossOutstanding = new Prisma.Decimal(0);
  let totalUnappliedCredit = new Prisma.Decimal(0);
  let totalUnappliedPayments = new Prisma.Decimal(0);
  const customerRows = [...customers.values()].map((customer) => ({ ...customer, items: customer.items.sort((a, b) => b.ageDays - a.ageDays) }));
  for (const customer of customerRows) {
    grossOutstanding = grossOutstanding.plus(customer.totalOutstanding);
    totalUnappliedCredit = totalUnappliedCredit.plus(customer.unappliedCredit);
    totalUnappliedPayments = totalUnappliedPayments.plus(customer.unappliedPayment);
    for (const bucket of Object.keys(customer.buckets) as ReceivablesBucket[]) totals[bucket] = new Prisma.Decimal(totals[bucket]).plus(customer.buckets[bucket]).toNumber();
    totals.current = new Prisma.Decimal(totals.current).plus(customer.items.filter((item) => item.bucket === "current").reduce((sum, item) => sum + item.outstandingAmount, 0)).toNumber();
  }

  return { asOfDate, grossOutstanding: grossOutstanding.toNumber(), totalOutstanding: grossOutstanding.minus(totalUnappliedCredit).minus(totalUnappliedPayments).toNumber(), totalUnappliedCredit: totalUnappliedCredit.toNumber(), totalUnappliedPayments: totalUnappliedPayments.toNumber(), buckets: totals, customers: customerRows };
}
