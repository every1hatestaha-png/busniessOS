import "server-only";

import { Prisma } from "@prisma/client";
import { postSupplierPaymentToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { supplierPaymentSchema, supplierSchema, type SupplierInput, type SupplierPaymentInput } from "@/lib/validation/supplier";

export class SupplierDomainError extends Error {}

export async function listSuppliers(workspaceId: string) {
  const rows = await db.supplier.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, include: { _count: { select: { purchaseOrders: true } }, purchaseOrders: { select: { totalAmount: true } } } });
  return rows.map((row) => ({ ...row, currentBalance: Number(row.currentBalance), totalPurchases: row.purchaseOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0), purchases: undefined }));
}

export async function getSupplier(workspaceId: string, id: string) {
  const row = await db.supplier.findFirst({ where: { id, workspaceId }, include: { ledgerEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100 }, payments: { orderBy: { paymentDate: "desc" }, take: 100 } } });
  if (!row) return null;
  return { ...row, currentBalance: Number(row.currentBalance), ledgerEntries: row.ledgerEntries.map((entry) => ({ ...entry, debit: Number(entry.debit), credit: Number(entry.credit) })), payments: row.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })) };
}

export async function createSupplier(context: ServiceContext, input: SupplierInput) {
  const data = supplierSchema.parse(input);
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data: { workspaceId: context.workspaceId, ...data, companyName: data.companyName || null, phone: data.phone || null, email: data.email || null, address: data.address || null, city: data.city || null, notes: data.notes || null } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.created", entityType: "Supplier", entityId: supplier.id });
    return supplier;
  });
}

export async function updateSupplier(context: ServiceContext, id: string, input: SupplierInput) {
  const data = supplierSchema.parse(input);
  return db.$transaction(async (tx) => {
    const found = await tx.supplier.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true } });
    if (!found) throw new SupplierDomainError("Supplier not found.");
    const supplier = await tx.supplier.update({ where: { id }, data: { ...data, companyName: data.companyName || null, phone: data.phone || null, email: data.email || null, address: data.address || null, city: data.city || null, notes: data.notes || null } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.updated", entityType: "Supplier", entityId: id });
    return supplier;
  });
}

export async function deleteSupplier(context: ServiceContext, id: string) {
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { _count: { select: { purchaseOrders: true, payments: true, ledgerEntries: true } } } });
    if (!supplier) throw new SupplierDomainError("Supplier not found.");
    if (supplier._count.purchaseOrders || supplier._count.payments || supplier._count.ledgerEntries || !supplier.currentBalance.isZero()) throw new SupplierDomainError("Suppliers with financial history cannot be deleted.");
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.deleted", entityType: "Supplier", entityId: id });
    await tx.supplier.delete({ where: { id } });
  });
}

export async function recordSupplierPayment(context: ServiceContext, supplierId: string, input: SupplierPaymentInput) {
  const data = supplierPaymentSchema.parse(input); const amount = new Prisma.Decimal(data.amount); const withholdingTaxAmount = new Prisma.Decimal(data.withholdingTaxAmount ?? 0); const netAmount = amount.minus(withholdingTaxAmount);
  return db.$transaction(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.payment.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, workspaceId: context.workspaceId }, select: { id: true, currentBalance: true } });
    if (!supplier) throw new SupplierDomainError("Supplier not found.");
    if (!data.cashBankAccountId) throw new SupplierDomainError("Select a cash/bank account for this voucher.");
    if (withholdingTaxAmount.greaterThan(amount)) throw new SupplierDomainError("Withholding tax cannot exceed the gross payment amount.");
    if (netAmount.lessThan(0)) throw new SupplierDomainError("Net payment cannot be negative.");
    const cashBankAccount = await tx.cashBankAccount.findFirst({ where: { id: data.cashBankAccountId, workspaceId: context.workspaceId, isActive: true }, select: { id: true } });
    if (!cashBankAccount) throw new SupplierDomainError("Cash/bank account is unavailable.");
    if (amount.greaterThan(supplier.currentBalance)) throw new SupplierDomainError("Payment cannot exceed supplier payable.");
    const requestedAllocations = data.allocations ?? [];
    if (!requestedAllocations.length) throw new SupplierDomainError("Allocate this payment to one or more purchase bills.");
    const allocationTotal = requestedAllocations.reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
    if (!allocationTotal.equals(amount)) throw new SupplierDomainError("Payment allocations must equal the gross payment amount.");
    const purchaseIds = requestedAllocations.map((entry) => entry.purchaseOrderId);
    if (new Set(purchaseIds).size !== purchaseIds.length) throw new SupplierDomainError("Duplicate purchase allocations are not allowed.");
    const purchases = await tx.purchaseOrder.findMany({ where: { id: { in: purchaseIds }, workspaceId: context.workspaceId, supplierId, status: { not: "CANCELLED" } }, select: { id: true, totalAmount: true, paidAmount: true } });
    if (purchases.length !== requestedAllocations.length) throw new SupplierDomainError("One or more purchases are unavailable.");
    for (const allocation of requestedAllocations) {
      const purchase = purchases.find((entry) => entry.id === allocation.purchaseOrderId)!;
      if (new Prisma.Decimal(allocation.amount).greaterThan(purchase.totalAmount.minus(purchase.paidAmount))) throw new SupplierDomainError("Payment exceeds purchase balance or purchase is unavailable.");
    }
    const number = await nextDocumentNumber(tx, context.workspaceId, "BANK_PAYMENT_VOUCHER");
    const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, supplierId, cashBankAccountId: cashBankAccount.id, documentNumber: number, idempotencyKey: data.idempotencyKey, amount, netAmount, withholdingTaxAmount, method: data.method, reference: data.reference || null, notes: data.notes || null, paymentDate: data.paymentDate } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId, type: "PAYMENT_MADE", debit: amount, description: `Supplier payment ${number}`, referenceId: payment.id, date: data.paymentDate } });
    await tx.supplier.update({ where: { id: supplierId }, data: { currentBalance: { decrement: amount } } });
    await postSupplierPaymentToGeneralLedger(tx, { workspaceId: context.workspaceId, paymentId: payment.id, documentNo: number, date: data.paymentDate, amount, withholdingTaxAmount, cashBankAccountId: cashBankAccount.id });
    for (const allocation of requestedAllocations) {
      const allocationAmount = new Prisma.Decimal(allocation.amount);
      await tx.paymentAllocation.create({ data: { workspaceId: context.workspaceId, paymentId: payment.id, purchaseOrderId: allocation.purchaseOrderId, amount: allocationAmount } });
      await tx.purchaseOrder.update({ where: { id: allocation.purchaseOrderId }, data: { paidAmount: { increment: allocationAmount }, balanceAmount: { decrement: allocationAmount } } });
    }
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.payment_recorded", entityType: "Payment", entityId: payment.id, metadata: { supplierId, amount: data.amount, withholdingTaxAmount: withholdingTaxAmount.toString(), netAmount: netAmount.toString(), documentNumber: number, allocations: requestedAllocations.map((a) => ({ purchaseOrderId: a.purchaseOrderId, amount: a.amount })) } });
    return { id: payment.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function getSupplierPaymentVoucher(workspaceId: string, paymentId: string) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, workspaceId, supplierId: { not: null } },
    include: {
      supplier: true,
      cashBankAccount: { include: { account: true } },
      allocations: { include: { purchaseOrder: { select: { orderNumber: true, orderDate: true, totalAmount: true } } } },
      workspace: true,
    },
  });
  if (!payment) return null;
  return {
    id: payment.id,
    documentNumber: payment.documentNumber ?? payment.reference ?? payment.id,
    paymentDate: payment.paymentDate.toISOString(),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    grossAmount: Number(payment.amount),
    withholdingTaxAmount: Number(payment.withholdingTaxAmount),
    netAmount: Number(payment.netAmount ?? payment.amount.minus(payment.withholdingTaxAmount)),
    supplier: payment.supplier ? { name: payment.supplier.name, companyName: payment.supplier.companyName, phone: payment.supplier.phone, address: payment.supplier.address, city: payment.supplier.city } : null,
    cashBankAccount: payment.cashBankAccount ? { name: payment.cashBankAccount.name, code: payment.cashBankAccount.account.code, isBank: payment.cashBankAccount.isBank, bankName: payment.cashBankAccount.bankName, accountTitle: payment.cashBankAccount.accountTitle, accountNumber: payment.cashBankAccount.accountNumber } : null,
    workspace: { name: payment.workspace.name, phone: payment.workspace.phone, email: payment.workspace.email, address: payment.workspace.address, city: payment.workspace.city, country: payment.workspace.country },
    allocations: payment.allocations.map((allocation) => ({ id: allocation.id, amount: Number(allocation.amount), purchaseOrder: allocation.purchaseOrder ? { orderNumber: allocation.purchaseOrder.orderNumber, orderDate: allocation.purchaseOrder.orderDate.toISOString(), totalAmount: Number(allocation.purchaseOrder.totalAmount) } : null })),
  };
}
