import "server-only";

import type { CustomerEditInput, CustomerInput } from "@/lib/validation/customer";
import { db } from "@/lib/server/db";
import { postOpeningAssetToGeneralLedger } from "@/lib/server/accounting";
import { Prisma, type Role } from "@prisma/client";
import { canPerformAction } from "@/lib/server/authorization";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { writeAudit } from "@/lib/server/audit";

type CustomerMutationContext = { workspaceId: string; role: Role; userId?: string };

export class CustomerDomainError extends Error {
  constructor(public readonly code: "CUSTOMER_NOT_FOUND" | "PERMISSION_DENIED", message: string) {
    super(message);
  }
}

export type RemoveCustomerResult = { disposition: "DELETED" | "DEACTIVATED"; message: string };

export type CustomerListItem = {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  creditLimit: number;
  currentBalance: number;
  status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
};

export type CustomerDetail = CustomerListItem & {
  address: string;
  notes: string;
  totalSales: number;
  totalPayments: number;
  ledgerEntries: Array<{
    id: string;
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    date: string;
    status: "DRAFT" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";
    total: number;
    balanceAmount: number;
  }>;
  payments: Array<{
    id: string;
    date: string;
    reference: string;
    method: "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE" | "CREDIT_CARD" | "MOBILE_WALLET" | "OTHER";
    amount: number;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    status: "DRAFT" | "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
    total: number;
    balance: number;
  }>;
};

export async function listCustomers(workspaceId: string): Promise<CustomerListItem[]> {
  const customers = await db.customer.findMany({
    where: { workspaceId },
    orderBy: [{ companyName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      city: true,
      creditLimit: true,
      currentBalance: true,
      status: true,
    },
  });

  return customers.map((customer) => ({
    ...customer,
    companyName: customer.companyName ?? customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    city: customer.city ?? "",
    creditLimit: Number(customer.creditLimit),
    currentBalance: Number(customer.currentBalance),
  }));
}

export async function getCustomer(workspaceId: string, id: string): Promise<CustomerDetail | null> {
  const [customer] = await db.$queryRaw<Array<{
    id: string;
    name: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    address: string | null;
    notes: string | null;
    creditLimit: Prisma.Decimal;
    currentBalance: Prisma.Decimal;
    status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
  }>>`
    SELECT "id", "name", "companyName", "phone", "email", "city", "address", "notes", "creditLimit", "currentBalance", "status"
    FROM "customers"
    WHERE "id" = ${id} AND "workspaceId" = ${workspaceId}
    LIMIT 1
  `;

  if (!customer) return null;

  const [salesOrders, rawPayments, rawInvoices, rawLedgerEntries] = await Promise.all([
    db.$queryRaw<Array<{ id: string; orderNumber: string; orderDate: Date; status: "DRAFT" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED"; total: Prisma.Decimal; balanceAmount: Prisma.Decimal }>>`
      SELECT "id", "orderNumber", "orderDate", "status", "total", "balanceAmount"
      FROM "sales_orders"
      WHERE "workspaceId" = ${workspaceId} AND "customerId" = ${id}
      ORDER BY "orderDate" DESC
    `,
    db.$queryRaw<Array<{ id: string; paymentDate: Date; reference: string | null; method: "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE" | "CREDIT_CARD" | "MOBILE_WALLET" | "OTHER"; amount: Prisma.Decimal; isReversed: boolean; reversalOfId: string | null }>>`
      SELECT "id", "paymentDate", "reference", "method", "amount", "isReversed", "reversalOfId"
      FROM "payments"
      WHERE "workspaceId" = ${workspaceId} AND "customerId" = ${id}
      ORDER BY "paymentDate" DESC
    `,
    db.$queryRaw<Array<{ id: string; invoiceNumber: string; issuedAt: Date; dueDate: Date | null; status: "DRAFT" | "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED"; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; creditApplied: Prisma.Decimal }>>`
      SELECT "id", "invoiceNumber", "issuedAt", "dueDate", "status", "amount", "paidAmount", "creditApplied"
      FROM "invoices"
      WHERE "workspaceId" = ${workspaceId} AND "customerId" = ${id}
      ORDER BY "issuedAt" DESC
    `,
    db.$queryRaw<Array<{ id: string; date: Date; referenceId: string | null; description: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal }>>`
      SELECT "id", "date", "referenceId", "description", "debit", "credit"
      FROM "ledger_entries"
      WHERE "workspaceId" = ${workspaceId} AND "customerId" = ${id}
      ORDER BY "date" ASC, "createdAt" ASC
    `,
  ]);

  const orders = salesOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    date: order.orderDate.toISOString(),
    status: order.status,
    total: Number(order.total),
    balanceAmount: Number(order.balanceAmount),
  }));
  const payments = rawPayments.map((payment) => ({
    id: payment.id,
    date: payment.paymentDate.toISOString(),
    reference: payment.reference ?? "-",
    method: payment.method,
    amount: Number(payment.amount),
    isReversed: payment.isReversed,
    isReversal: Boolean(payment.reversalOfId),
  }));

  return {
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName ?? customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    city: customer.city ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
    creditLimit: Number(customer.creditLimit),
    currentBalance: Number(customer.currentBalance),
    status: customer.status,
    totalSales: orders.filter((order) => order.status !== "CANCELLED").reduce((total, order) => total.plus(new Prisma.Decimal(order.total)), new Prisma.Decimal(0)).toNumber(),
    totalPayments: payments.filter((payment) => !payment.isReversed && !payment.isReversal).reduce((total, payment) => total.plus(new Prisma.Decimal(payment.amount)), new Prisma.Decimal(0)).toNumber(),
    orders,
    payments,
    invoices: rawInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      status: invoice.status,
      total: Number(invoice.amount),
      balance: new Prisma.Decimal(invoice.amount).minus(new Prisma.Decimal(invoice.paidAmount)).minus(new Prisma.Decimal(invoice.creditApplied)).toNumber(),
    })),
    ledgerEntries: rawLedgerEntries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      reference: entry.referenceId ?? "-",
      description: entry.description ?? "",
      debit: Number(entry.debit),
      credit: Number(entry.credit),
    })),
  };
}

export async function createCustomer(workspaceId: string, input: CustomerInput): Promise<string> {
  const openingBalance = input.openingBalance;

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        workspaceId,
        name: input.name,
        companyName: input.companyName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        address: input.address,
        creditLimit: input.creditLimit,
        currentBalance: openingBalance,
        status: input.status,
        notes: input.notes || null,
      },
      select: { id: true },
    });

    if (Number(openingBalance) > 0) {
      await tx.ledgerEntry.create({
        data: {
          workspaceId,
          customerId: customer.id,
          type: "OPENING_BALANCE",
          debit: openingBalance,
          description: "Customer opening balance",
        },
      });
      await postOpeningAssetToGeneralLedger(tx, { workspaceId, sourceId: customer.id, documentNo: `OPEN-CUST-${customer.id.slice(0, 8).toUpperCase()}`, date: new Date(), assetSystemCode: "ACCOUNTS_RECEIVABLE", amount: new Prisma.Decimal(openingBalance) });
    }

    return customer.id;
  }, { timeout: 30_000 });
}

export async function updateCustomer(
  context: CustomerMutationContext,
  id: string,
  input: CustomerEditInput,
): Promise<void> {
  if (!canPerformAction(context.role, "customers.write")) throw new CustomerDomainError("PERMISSION_DENIED", "Unauthorized");
  await withSerializableRetry(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true } });
    if (!customer) throw new CustomerDomainError("CUSTOMER_NOT_FOUND", "Customer not found.");
    await tx.customer.update({
      where: { id, workspaceId: context.workspaceId },
      data: {
        name: input.name,
        companyName: input.companyName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        address: input.address,
        creditLimit: input.creditLimit,
        status: input.status,
        notes: input.notes || null,
      },
    });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer.updated", entityType: "Customer", entityId: id, metadata: { status: input.status } });
  });
}

export async function removeCustomer(context: CustomerMutationContext, id: string): Promise<RemoveCustomerResult> {
  if (!canPerformAction(context.role, "customers.write")) throw new CustomerDomainError("PERMISSION_DENIED", "Unauthorized");
  return withSerializableRetry(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id, workspaceId: context.workspaceId },
      include: { _count: { select: { salesOrders: true, invoices: true, payments: true, ledgerEntries: true, creditNotes: true, returns: true } } },
    });
    if (!customer) throw new CustomerDomainError("CUSTOMER_NOT_FOUND", "Customer not found.");
    const hasHistory = Object.values(customer._count).some((count) => count > 0) || !customer.currentBalance.isZero();
    const displayName = customer.companyName ?? customer.name;
    if (!hasHistory) {
      await tx.customer.delete({ where: { id, workspaceId: context.workspaceId } });
      await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer.deleted", entityType: "Customer", entityId: id, metadata: { name: displayName } });
      return { disposition: "DELETED", message: `${displayName} was permanently deleted.` };
    }
    await tx.customer.update({ where: { id, workspaceId: context.workspaceId }, data: { status: "INACTIVE" } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer.deactivated", entityType: "Customer", entityId: id, metadata: { name: displayName } });
    return { disposition: "DEACTIVATED", message: "This customer has transaction history and cannot be permanently deleted. It has been deactivated instead." };
  });
}
