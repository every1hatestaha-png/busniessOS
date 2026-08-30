import "server-only";

import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { customerCreditAllocationSchema, type CustomerCreditAllocationInput } from "@/lib/validation/customer-credit";

export class CustomerCreditDomainError extends Error {}

function invoiceStatus(amount: Prisma.Decimal, settled: Prisma.Decimal) {
  if (settled.isZero()) return "UNPAID" as const;
  return settled.equals(amount) ? "PAID" as const : "PARTIALLY_PAID" as const;
}

export async function allocateCustomerCredit(context: ServiceContext, input: CustomerCreditAllocationInput) {
  const data = customerCreditAllocationSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.customerCreditAllocation.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }

    const credit = await tx.creditNote.findFirst({ where: { id: data.creditNoteId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } }, select: { id: true, customerId: true, amount: true, appliedAmount: true, remainingAmount: true } });
    if (!credit) throw new CustomerCreditDomainError("Customer credit is unavailable.");
    if (amount.greaterThan(credit.remainingAmount)) throw new CustomerCreditDomainError("Credit allocation exceeds available credit.");

    const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, workspaceId: context.workspaceId, customerId: credit.customerId, status: { notIn: ["CANCELLED", "DRAFT"] } }, select: { id: true, amount: true, paidAmount: true, creditApplied: true, salesOrderId: true } });
    if (!invoice) throw new CustomerCreditDomainError("Invoice is unavailable for this customer credit.");
    const outstanding = invoice.amount.minus(invoice.paidAmount).minus(invoice.creditApplied);
    if (outstanding.lessThanOrEqualTo(0)) throw new CustomerCreditDomainError("Invoice has no outstanding amount.");
    if (amount.greaterThan(outstanding)) throw new CustomerCreditDomainError("Credit allocation exceeds invoice outstanding amount.");

    const creditUpdated = await tx.creditNote.updateMany({
      where: { id: credit.id, workspaceId: context.workspaceId, remainingAmount: { gte: amount } },
      data: { appliedAmount: { increment: amount }, remainingAmount: { decrement: amount }, status: amount.equals(credit.remainingAmount) ? "APPLIED" : "PARTIALLY_APPLIED" },
    });
    if (creditUpdated.count !== 1) throw new CustomerCreditDomainError("Credit allocation exceeds available credit.");

    const maxCurrentCreditApplied = invoice.amount.minus(invoice.paidAmount).minus(amount);
    const invoiceUpdated = await tx.invoice.updateMany({
      where: { id: invoice.id, workspaceId: context.workspaceId, creditApplied: { lte: maxCurrentCreditApplied }, status: { notIn: ["CANCELLED", "DRAFT"] } },
      data: { creditApplied: { increment: amount }, status: invoiceStatus(invoice.amount, invoice.paidAmount.plus(invoice.creditApplied).plus(amount)) },
    });
    if (invoiceUpdated.count !== 1) throw new CustomerCreditDomainError("Credit allocation exceeds invoice outstanding amount.");

    if (invoice.salesOrderId) {
      const orderUpdated = await tx.salesOrder.updateMany({ where: { id: invoice.salesOrderId, workspaceId: context.workspaceId, balanceAmount: { gte: amount } }, data: { balanceAmount: { decrement: amount } } });
      if (orderUpdated.count !== 1) throw new CustomerCreditDomainError("Credit allocation exceeds order outstanding amount.");
    }

    const allocation = await tx.customerCreditAllocation.create({ data: { workspaceId: context.workspaceId, creditNoteId: credit.id, invoiceId: invoice.id, amount, idempotencyKey: data.idempotencyKey }, select: { id: true } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_credit.allocated", entityType: "CustomerCreditAllocation", entityId: allocation.id, metadata: { creditNoteId: credit.id, invoiceId: invoice.id, amount: amount.toString() } });
    return allocation;
  });
}

export async function getCustomerCredits(workspaceId: string, customerId?: string) {
  const rows = await db.creditNote.findMany({
    where: { workspaceId, ...(customerId ? { customerId } : {}), status: { not: "CANCELLED" } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { customer: { select: { name: true, companyName: true } }, allocations: { include: { invoice: { select: { invoiceNumber: true } } }, orderBy: { createdAt: "desc" } } },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    customerName: row.customer.companyName ?? row.customer.name,
    salesOrderId: row.salesOrderId,
    customerReturnId: row.customerReturnId,
    date: row.date.toISOString(),
    amount: Number(row.amount),
    appliedAmount: Number(row.appliedAmount),
    remainingAmount: Number(row.remainingAmount),
    status: row.status,
    allocations: row.allocations.map((allocation) => ({ id: allocation.id, invoiceId: allocation.invoiceId, invoiceNumber: allocation.invoice.invoiceNumber, amount: Number(allocation.amount), createdAt: allocation.createdAt.toISOString() })),
  }));
}
