import "server-only";

import { Prisma } from "@prisma/client";

import { ensureDefaultAccounts, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { canPerformAction } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import {
  manualCustomerCreditNoteSchema,
  manualSupplierDebitNoteSchema,
  type ManualCustomerCreditNoteInput,
  type ManualSupplierDebitNoteInput,
} from "@/lib/validation/manual-notes";

export class ManualFinancialNoteError extends Error {}

function assertFinancialAdjustmentAccess(context: ServiceContext) {
  if (!canPerformAction(context.role, "financial.manage")) {
    throw new ManualFinancialNoteError("You do not have permission to create financial adjustments.");
  }
}

async function systemAccount(tx: Prisma.TransactionClient, workspaceId: string, systemCode: "ACCOUNTS_RECEIVABLE" | "ACCOUNTS_PAYABLE" | "SALES_REVENUE" | "OTHER_INCOME") {
  await ensureDefaultAccounts(workspaceId, tx);
  return tx.account.findUniqueOrThrow({
    where: { workspaceId_systemCode: { workspaceId, systemCode } },
    select: { id: true },
  });
}

export async function createManualCustomerCreditNote(context: ServiceContext, input: ManualCustomerCreditNoteInput) {
  assertFinancialAdjustmentAccess(context);
  const data = manualCustomerCreditNoteSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);

  return withSerializableRetry(async (tx) => {
    const existing = await tx.creditNote.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: { id: true, customerId: true, amount: true, reason: true, reference: true, notes: true },
    });
    if (existing) {
      const exactReplay = existing.customerId === data.customerId
        && existing.amount.equals(amount)
        && existing.reason === data.reason
        && (existing.reference ?? "") === data.reference
        && (existing.notes ?? "") === data.notes;
      if (!exactReplay) throw new ManualFinancialNoteError("This idempotency key was already used for a different customer credit note.");
      return { id: existing.id };
    }

    const customer = await tx.customer.findFirst({
      where: { id: data.customerId, workspaceId: context.workspaceId },
      select: { id: true, currentBalance: true },
    });
    if (!customer) throw new ManualFinancialNoteError("Customer not found.");
    if (amount.greaterThan(customer.currentBalance)) {
      throw new ManualFinancialNoteError("Credit note amount cannot exceed the customer's current receivable balance.");
    }

    const number = await nextDocumentNumber(tx, context.workspaceId, "CREDIT_NOTE");
    const note = await tx.creditNote.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customer.id,
        number,
        reason: data.reason,
        amount,
        appliedAmount: 0,
        remainingAmount: amount,
        status: "OPEN",
        reference: data.reference || null,
        notes: data.notes || null,
        idempotencyKey: data.idempotencyKey,
      },
      select: { id: true, number: true, date: true },
    });

    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customer.id,
        type: "CREDIT_NOTE",
        credit: amount,
        description: `Manual credit note ${number}: ${data.reason}`,
        referenceId: note.id,
      },
    });
    await tx.customer.update({
      where: { id: customer.id, workspaceId: context.workspaceId },
      data: { currentBalance: { decrement: amount } },
    });

    const [salesRevenue, receivable] = await Promise.all([
      systemAccount(tx, context.workspaceId, "SALES_REVENUE"),
      systemAccount(tx, context.workspaceId, "ACCOUNTS_RECEIVABLE"),
    ]);
    await tx.generalLedgerEntry.createMany({
      data: [
        {
          workspaceId: context.workspaceId,
          accountId: salesRevenue.id,
          sourceType: "ADJUSTMENT",
          sourceId: note.id,
          documentNo: number,
          date: note.date,
          narration: `Manual customer credit note: ${data.reason}`,
          debit: amount,
          credit: 0,
        },
        {
          workspaceId: context.workspaceId,
          accountId: receivable.id,
          sourceType: "ADJUSTMENT",
          sourceId: note.id,
          documentNo: number,
          date: note.date,
          narration: `Manual customer credit note: ${data.reason}`,
          debit: 0,
          credit: amount,
        },
      ],
    });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_credit_note.created",
      entityType: "CreditNote",
      entityId: note.id,
      metadata: { number, customerId: customer.id, amount: amount.toString(), reason: data.reason },
    });
    return { id: note.id };
  });
}

export async function createManualSupplierDebitNote(context: ServiceContext, input: ManualSupplierDebitNoteInput) {
  assertFinancialAdjustmentAccess(context);
  const data = manualSupplierDebitNoteSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  const purchaseOrderId = data.purchaseOrderId || null;

  return withSerializableRetry(async (tx) => {
    const existing = await tx.debitNote.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: { id: true, supplierId: true, purchaseOrderId: true, amount: true, reason: true, reference: true, notes: true },
    });
    if (existing) {
      const exactReplay = existing.supplierId === data.supplierId
        && (existing.purchaseOrderId ?? "") === (purchaseOrderId ?? "")
        && existing.amount.equals(amount)
        && existing.reason === data.reason
        && (existing.reference ?? "") === data.reference
        && (existing.notes ?? "") === data.notes;
      if (!exactReplay) throw new ManualFinancialNoteError("This idempotency key was already used for a different supplier debit note.");
      return { id: existing.id };
    }

    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, workspaceId: context.workspaceId },
      select: { id: true, currentBalance: true },
    });
    if (!supplier) throw new ManualFinancialNoteError("Supplier not found.");
    if (amount.greaterThan(supplier.currentBalance)) {
      throw new ManualFinancialNoteError("Debit note amount cannot exceed the supplier's current payable balance.");
    }

    let purchaseOrder: { id: string; balanceAmount: Prisma.Decimal } | null = null;
    if (purchaseOrderId) {
      purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, workspaceId: context.workspaceId, supplierId: supplier.id, status: { not: "CANCELLED" } },
        select: { id: true, balanceAmount: true },
      });
      if (!purchaseOrder) throw new ManualFinancialNoteError("Purchase order is unavailable for this supplier.");
      if (amount.greaterThan(purchaseOrder.balanceAmount)) {
        throw new ManualFinancialNoteError("Debit note amount cannot exceed the selected purchase order's outstanding balance.");
      }
    }

    const number = await nextDocumentNumber(tx, context.workspaceId, "DEBIT_NOTE");
    const note = await tx.debitNote.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: supplier.id,
        purchaseOrderId,
        number,
        reason: data.reason,
        amount,
        reference: data.reference || null,
        notes: data.notes || null,
        idempotencyKey: data.idempotencyKey,
        status: "OPEN",
      },
      select: { id: true, number: true, date: true },
    });

    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: supplier.id,
        type: "DEBIT_NOTE",
        debit: amount,
        description: `Manual debit note ${number}: ${data.reason}`,
        referenceId: note.id,
      },
    });
    await tx.supplier.update({
      where: { id: supplier.id, workspaceId: context.workspaceId },
      data: { currentBalance: { decrement: amount } },
    });
    if (purchaseOrder) {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id, workspaceId: context.workspaceId },
        data: { balanceAmount: { decrement: amount } },
      });
    }

    const [payable, otherIncome] = await Promise.all([
      systemAccount(tx, context.workspaceId, "ACCOUNTS_PAYABLE"),
      systemAccount(tx, context.workspaceId, "OTHER_INCOME"),
    ]);
    await tx.generalLedgerEntry.createMany({
      data: [
        {
          workspaceId: context.workspaceId,
          accountId: payable.id,
          sourceType: "ADJUSTMENT",
          sourceId: note.id,
          documentNo: number,
          date: note.date,
          narration: `Manual supplier debit note: ${data.reason}`,
          debit: amount,
          credit: 0,
        },
        {
          workspaceId: context.workspaceId,
          accountId: otherIncome.id,
          sourceType: "ADJUSTMENT",
          sourceId: note.id,
          documentNo: number,
          date: note.date,
          narration: `Manual supplier debit note: ${data.reason}`,
          debit: 0,
          credit: amount,
        },
      ],
    });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "supplier_debit_note.created",
      entityType: "DebitNote",
      entityId: note.id,
      metadata: { number, supplierId: supplier.id, purchaseOrderId, amount: amount.toString(), reason: data.reason },
    });
    return { id: note.id };
  });
}

export async function cancelManualCustomerCreditNote(context: ServiceContext, id: string, reason: string) {
  assertFinancialAdjustmentAccess(context);
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) throw new ManualFinancialNoteError("Enter a cancellation reason.");

  return withSerializableRetry(async (tx) => {
    const note = await tx.creditNote.findFirst({
      where: { id, workspaceId: context.workspaceId, customerReturnId: null, idempotencyKey: { not: null } },
      include: { allocations: { select: { id: true }, take: 1 } },
    });
    if (!note) throw new ManualFinancialNoteError("Manual customer credit note not found.");
    if (note.status === "CANCELLED") return { id: note.id, alreadyCancelled: true };
    if (note.allocations.length) throw new ManualFinancialNoteError("Allocated credit notes must be unallocated before cancellation.");

    await tx.creditNote.update({ where: { id: note.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED" } });
    await tx.customer.update({
      where: { id: note.customerId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: note.amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: note.customerId,
        type: "REVERSAL",
        debit: note.amount,
        description: `Cancelled credit note ${note.number}: ${cleanReason}`,
        referenceId: note.id,
      },
    });
    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "ADJUSTMENT", sourceId: note.id }],
      documentNo: `REV-${note.number}`,
      date: new Date(),
      reason: `Cancelled manual credit note ${note.number}: ${cleanReason}`,
      reversedById: context.userId,
    });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_credit_note.cancelled",
      entityType: "CreditNote",
      entityId: note.id,
      metadata: { number: note.number, reason: cleanReason },
    });
    return { id: note.id, alreadyCancelled: false };
  });
}

export async function cancelManualSupplierDebitNote(context: ServiceContext, id: string, reason: string) {
  assertFinancialAdjustmentAccess(context);
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) throw new ManualFinancialNoteError("Enter a cancellation reason.");

  return withSerializableRetry(async (tx) => {
    const note = await tx.debitNote.findFirst({
      where: { id, workspaceId: context.workspaceId, idempotencyKey: { not: null } },
    });
    if (!note) throw new ManualFinancialNoteError("Manual supplier debit note not found.");
    if (note.status === "CANCELLED") return { id: note.id, alreadyCancelled: true };

    await tx.debitNote.update({ where: { id: note.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED" } });
    await tx.supplier.update({
      where: { id: note.supplierId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: note.amount } },
    });
    if (note.purchaseOrderId) {
      await tx.purchaseOrder.updateMany({
        where: { id: note.purchaseOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } },
        data: { balanceAmount: { increment: note.amount } },
      });
    }
    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: note.supplierId,
        type: "REVERSAL",
        credit: note.amount,
        description: `Cancelled debit note ${note.number}: ${cleanReason}`,
        referenceId: note.id,
      },
    });
    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "ADJUSTMENT", sourceId: note.id }],
      documentNo: `REV-${note.number}`,
      date: new Date(),
      reason: `Cancelled manual debit note ${note.number}: ${cleanReason}`,
      reversedById: context.userId,
    });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "supplier_debit_note.cancelled",
      entityType: "DebitNote",
      entityId: note.id,
      metadata: { number: note.number, reason: cleanReason },
    });
    return { id: note.id, alreadyCancelled: false };
  });
}

export async function listManualFinancialNotes(workspaceId: string) {
  const [customerCredits, supplierDebits] = await Promise.all([
    db.creditNote.findMany({
      where: { workspaceId, customerReturnId: null, idempotencyKey: { not: null } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { customer: { select: { name: true, companyName: true } } },
    }),
    db.debitNote.findMany({
      where: { workspaceId, idempotencyKey: { not: null } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { supplier: { select: { name: true, companyName: true } }, purchaseOrder: { select: { orderNumber: true } } },
    }),
  ]);
  return {
    customerCredits: customerCredits.map((note) => ({
      id: note.id,
      number: note.number,
      party: note.customer.companyName ?? note.customer.name,
      amount: Number(note.amount),
      reason: note.reason,
      status: note.status,
      date: note.date.toISOString(),
    })),
    supplierDebits: supplierDebits.map((note) => ({
      id: note.id,
      number: note.number,
      party: note.supplier.companyName ?? note.supplier.name,
      purchaseOrder: note.purchaseOrder?.orderNumber ?? null,
      amount: Number(note.amount),
      reason: note.reason,
      status: note.status,
      date: note.date.toISOString(),
    })),
  };
}
