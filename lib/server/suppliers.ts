import "server-only";

import { Prisma } from "@prisma/client";
import { postSupplierOpeningBalanceToGeneralLedger, postSupplierPaymentToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { supplierPaymentSchema, supplierSchema, type SupplierInput, type SupplierPaymentInput } from "@/lib/validation/supplier";
import { canPerformAction } from "@/lib/server/authorization";

export class SupplierDomainError extends Error {}

type SupplierSettlementTarget = {
  id: string;
  grnNumber: string;
  receiptDate: string;
  purchaseOrderId: string;
  orderNumber: string;
  totalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
};

type SupplierSettlementSnapshot = {
  supplierId: string;
  currentBalance: number;
  openingBalance: {
    originalAmount: number;
    settledAmount: number;
    outstandingAmount: number;
  };
  grns: SupplierSettlementTarget[];
};

async function buildSupplierSettlementSnapshot(tx: Prisma.TransactionClient, workspaceId: string, supplierId: string): Promise<SupplierSettlementSnapshot | null> {
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, workspaceId },
    select: { id: true, currentBalance: true },
  });
  if (!supplier) return null;

  // Keep transaction-client queries sequential. The pg adapter uses a single client
  // for an interactive transaction; overlapping tx queries trigger pg's
  // "client.query() while already executing" warning and will stop being supported.
  const openingLedger = await tx.ledgerEntry.aggregate({
    where: { workspaceId, supplierId, type: "OPENING_BALANCE" },
    _sum: { debit: true, credit: true },
  });
  const openingPayments = await tx.paymentAllocation.aggregate({
    where: {
      workspaceId,
      isSupplierOpeningBalance: true,
      payment: { supplierId, isReversed: false, reversalOfId: null },
    },
    _sum: { amount: true },
  });
  const grns = await tx.goodReceivedNote.findMany({
    where: { workspaceId, supplierId, status: "ACTIVE" },
    orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }, { grnNumber: "asc" }],
    select: {
      id: true,
      grnNumber: true,
      receiptDate: true,
      createdAt: true,
      purchaseOrderId: true,
      totalAmount: true,
    },
  });

  // Prisma can expand nested relation selects into overlapping driver queries.
  // Load each relation explicitly and sequentially so the interactive
  // transaction remains compatible with pg@9's single-query client contract.
  const purchaseOrderIds = [...new Set(grns.map((grn) => grn.purchaseOrderId))];
  const grnIds = grns.map((grn) => grn.id);
  const purchaseOrders = purchaseOrderIds.length
    ? await tx.purchaseOrder.findMany({
      where: { workspaceId, supplierId, id: { in: purchaseOrderIds } },
      select: { id: true, orderNumber: true, balanceAmount: true },
    })
    : [];
  const paymentAllocations = grnIds.length
    ? await tx.paymentAllocation.findMany({
      where: {
        workspaceId,
        goodReceivedNoteId: { in: grnIds },
        payment: { supplierId, isReversed: false, reversalOfId: null },
      },
      select: { goodReceivedNoteId: true, amount: true },
    })
    : [];
  const supplierReturns = grnIds.length
    ? await tx.supplierReturn.findMany({
      where: { workspaceId, supplierId, goodReceivedNoteId: { in: grnIds }, status: "POSTED" },
      select: { goodReceivedNoteId: true, totalAmount: true },
    })
    : [];

  const purchaseOrdersById = new Map(purchaseOrders.map((order) => [order.id, order]));
  const allocationsByGrn = new Map<string, typeof paymentAllocations>();
  for (const allocation of paymentAllocations) {
    if (!allocation.goodReceivedNoteId) continue;
    const rows = allocationsByGrn.get(allocation.goodReceivedNoteId) ?? [];
    rows.push(allocation);
    allocationsByGrn.set(allocation.goodReceivedNoteId, rows);
  }
  const returnsByGrn = new Map<string, typeof supplierReturns>();
  for (const supplierReturn of supplierReturns) {
    if (!supplierReturn.goodReceivedNoteId) continue;
    const rows = returnsByGrn.get(supplierReturn.goodReceivedNoteId) ?? [];
    rows.push(supplierReturn);
    returnsByGrn.set(supplierReturn.goodReceivedNoteId, rows);
  }

  const originalOpening = new Prisma.Decimal(openingLedger._sum.credit ?? 0).minus(openingLedger._sum.debit ?? 0);
  const openingSettled = new Prisma.Decimal(openingPayments._sum.amount ?? 0);

  const grouped = new Map<string, typeof grns>();
  for (const grn of grns) {
    const list = grouped.get(grn.purchaseOrderId) ?? [];
    list.push(grn);
    grouped.set(grn.purchaseOrderId, list);
  }

  const targets: SupplierSettlementTarget[] = [];
  for (const purchaseGrns of grouped.values()) {
    const purchaseOrder = purchaseOrdersById.get(purchaseGrns[0].purchaseOrderId);
    if (!purchaseOrder) throw new SupplierDomainError("Purchase order not found for an active GRN.");
    const totalLiability = purchaseGrns.reduce((sum, grn) => sum.plus(grn.totalAmount), new Prisma.Decimal(0));
    const purchaseOutstanding = Prisma.Decimal.max(0, Prisma.Decimal.min(totalLiability, purchaseOrder.balanceAmount));
    const aggregateReduction = Prisma.Decimal.max(0, totalLiability.minus(purchaseOutstanding));

    const rows = purchaseGrns.map((grn) => {
      const directPayments = (allocationsByGrn.get(grn.id) ?? []).reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
      const linkedReturns = (returnsByGrn.get(grn.id) ?? []).reduce((sum, supplierReturn) => sum.plus(supplierReturn.totalAmount), new Prisma.Decimal(0));
      const directReduction = Prisma.Decimal.min(grn.totalAmount, directPayments.plus(linkedReturns));
      return {
        grn,
        remaining: Prisma.Decimal.max(0, grn.totalAmount.minus(directReduction)),
        directReduction,
      };
    });

    const knownReduction = rows.reduce((sum, row) => sum.plus(row.directReduction), new Prisma.Decimal(0));
    let legacyOrUnlinkedReduction = Prisma.Decimal.max(0, aggregateReduction.minus(knownReduction));

    // Historical PO-level payments and returns that were not tied to a GRN are
    // applied FIFO for display/allocation capacity only. New payments are always
    // persisted against explicit GRNs.
    for (const row of rows) {
      if (legacyOrUnlinkedReduction.lte(0)) break;
      const applied = Prisma.Decimal.min(row.remaining, legacyOrUnlinkedReduction);
      row.remaining = row.remaining.minus(applied);
      legacyOrUnlinkedReduction = legacyOrUnlinkedReduction.minus(applied);
    }

    for (const row of rows) {
      const total = new Prisma.Decimal(row.grn.totalAmount);
      const outstanding = Prisma.Decimal.max(0, row.remaining);
      targets.push({
        id: row.grn.id,
        grnNumber: row.grn.grnNumber,
        receiptDate: row.grn.receiptDate.toISOString(),
        purchaseOrderId: row.grn.purchaseOrderId,
        orderNumber: purchaseOrder.orderNumber,
        totalAmount: total.toNumber(),
        settledAmount: total.minus(outstanding).toNumber(),
        outstandingAmount: outstanding.toNumber(),
      });
    }
  }

  // `currentBalance` is the canonical supplier payable. Older MunshiOS data can
  // legitimately contain a supplier balance that predates persisted opening-balance
  // ledger rows / GRN allocation rows. Reconcile any liability not explained by
  // active GRNs into the opening/previous-balance settlement bucket so legacy
  // suppliers remain payable without reintroducing PO-level payment targets.
  const currentPayable = Prisma.Decimal.max(0, supplier.currentBalance);
  const grnOutstandingTotal = targets.reduce((sum, target) => sum.plus(target.outstandingAmount), new Prisma.Decimal(0));
  const reconciledOpeningOutstanding = Prisma.Decimal.max(0, currentPayable.minus(grnOutstandingTotal));
  const reconciledOpeningOriginal = Prisma.Decimal.max(originalOpening, openingSettled.plus(reconciledOpeningOutstanding));
  const reconciledOpeningSettled = Prisma.Decimal.max(0, reconciledOpeningOriginal.minus(reconciledOpeningOutstanding));

  return {
    supplierId: supplier.id,
    currentBalance: Number(supplier.currentBalance),
    openingBalance: {
      originalAmount: reconciledOpeningOriginal.toNumber(),
      settledAmount: reconciledOpeningSettled.toNumber(),
      outstandingAmount: reconciledOpeningOutstanding.toNumber(),
    },
    grns: targets.sort((a, b) => a.receiptDate.localeCompare(b.receiptDate) || a.grnNumber.localeCompare(b.grnNumber)),
  };
}

export async function getSupplierSettlementTargets(workspaceId: string, supplierId: string) {
  return db.$transaction((tx) => buildSupplierSettlementSnapshot(tx, workspaceId, supplierId));
}

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
  if (!canPerformAction(context.role, "suppliers.manage")) throw new SupplierDomainError("Unauthorized");
  const data = supplierSchema.parse(input);
  const { openingBalance, ...supplierData } = data;
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        workspaceId: context.workspaceId,
        ...supplierData,
        companyName: data.companyName || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        notes: data.notes || null,
        currentBalance: openingBalance,
      },
    });
    if (openingBalance > 0) {
      const openingAmount = new Prisma.Decimal(openingBalance);
      const documentNo = `OPEN-SUP-${supplier.id.slice(0, 8).toUpperCase()}`;
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          supplierId: supplier.id,
          type: "OPENING_BALANCE",
          credit: openingAmount,
          description: "Supplier opening balance",
          referenceId: supplier.id,
        },
      });
      await postSupplierOpeningBalanceToGeneralLedger(tx, {
        workspaceId: context.workspaceId,
        sourceId: supplier.id,
        documentNo,
        date: new Date(),
        amount: openingAmount,
      });
    }
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.created", entityType: "Supplier", entityId: supplier.id, metadata: { openingBalance: String(openingBalance) } });
    return supplier;
  });
}

export async function updateSupplier(context: ServiceContext, id: string, input: SupplierInput) {
  if (!canPerformAction(context.role, "suppliers.manage")) throw new SupplierDomainError("Unauthorized");
  const data = supplierSchema.omit({ openingBalance: true }).parse(input);
  return db.$transaction(async (tx) => {
    const found = await tx.supplier.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true } });
    if (!found) throw new SupplierDomainError("Supplier not found.");
    const supplier = await tx.supplier.update({ where: { id, workspaceId: context.workspaceId }, data: { ...data, companyName: data.companyName || null, phone: data.phone || null, email: data.email || null, address: data.address || null, city: data.city || null, notes: data.notes || null } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.updated", entityType: "Supplier", entityId: id });
    return supplier;
  });
}

export async function deleteSupplier(context: ServiceContext, id: string) {
  if (!canPerformAction(context.role, "suppliers.manage")) throw new SupplierDomainError("Unauthorized");
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { _count: { select: { purchaseOrders: true, payments: true, ledgerEntries: true } } } });
    if (!supplier) throw new SupplierDomainError("Supplier not found.");
    if (supplier._count.purchaseOrders || supplier._count.payments || supplier._count.ledgerEntries || !supplier.currentBalance.isZero()) throw new SupplierDomainError("Suppliers with financial history cannot be deleted.");
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier.deleted", entityType: "Supplier", entityId: id });
    await tx.supplier.delete({ where: { id, workspaceId: context.workspaceId } });
  });
}

export async function recordSupplierPayment(context: ServiceContext, supplierId: string, input: SupplierPaymentInput) {
  if (!canPerformAction(context.role, "payments.record")) throw new SupplierDomainError("Unauthorized");
  const data = supplierPaymentSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  const withholdingTaxAmount = new Prisma.Decimal(data.withholdingTaxAmount ?? 0);
  const netAmount = amount.minus(withholdingTaxAmount);

  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.payment.findFirst({
        where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
        select: {
          id: true,
          customerId: true,
          supplierId: true,
          amount: true,
          withholdingTaxAmount: true,
          cashBankAccountId: true,
          method: true,
          allocations: { select: { purchaseOrderId: true, goodReceivedNoteId: true, isSupplierOpeningBalance: true, amount: true } },
        },
      });
      if (existing) {
        const sameCore = !existing.customerId && existing.supplierId === supplierId && existing.amount.equals(data.amount) && existing.withholdingTaxAmount.equals(data.withholdingTaxAmount ?? 0) && existing.cashBankAccountId === data.cashBankAccountId && existing.method === data.method;
        const sameAllocations = data.allocations.every((requested) => {
          const matching = existing.allocations.filter((allocation) => requested.openingBalance ? allocation.isSupplierOpeningBalance : requested.goodReceivedNoteId ? allocation.goodReceivedNoteId === requested.goodReceivedNoteId : allocation.purchaseOrderId === requested.purchaseOrderId);
          return matching.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0)).equals(requested.amount);
        }) && existing.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0)).equals(amount);
        if (!sameCore || !sameAllocations) throw new SupplierDomainError("This idempotency key was already used for a different payment request.");
        return { id: existing.id };
      }
    }

    const snapshot = await buildSupplierSettlementSnapshot(tx, context.workspaceId, supplierId);
    if (!snapshot) throw new SupplierDomainError("Supplier not found.");
    if (!data.cashBankAccountId) throw new SupplierDomainError("Select a cash/bank account for this voucher.");
    if (withholdingTaxAmount.greaterThan(amount)) throw new SupplierDomainError("Withholding tax cannot exceed the gross payment amount.");
    if (netAmount.lessThan(0)) throw new SupplierDomainError("Net payment cannot be negative.");

    const cashBankAccount = await tx.cashBankAccount.findFirst({ where: { id: data.cashBankAccountId, workspaceId: context.workspaceId, isActive: true }, select: { id: true } });
    if (!cashBankAccount) throw new SupplierDomainError("Cash/bank account is unavailable.");
    if (amount.greaterThan(snapshot.currentBalance)) throw new SupplierDomainError("Payment cannot exceed supplier payable.");

    const allocationTotal = data.allocations.reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
    if (!allocationTotal.equals(amount)) throw new SupplierDomainError("Payment allocations must equal the gross payment amount.");

    const openingCapacity = new Prisma.Decimal(snapshot.openingBalance.outstandingAmount);
    let openingRemaining = openingCapacity;
    const grnRemaining = new Map(snapshot.grns.map((grn) => [grn.id, new Prisma.Decimal(grn.outstandingAmount)]));
    const grnById = new Map(snapshot.grns.map((grn) => [grn.id, grn]));
    const normalized = new Map<string, { goodReceivedNoteId: string | null; purchaseOrderId: string | null; isSupplierOpeningBalance: boolean; amount: Prisma.Decimal }>();

    const addNormalized = (key: string, target: { goodReceivedNoteId: string | null; purchaseOrderId: string | null; isSupplierOpeningBalance: boolean }, value: Prisma.Decimal) => {
      const existing = normalized.get(key);
      if (existing) existing.amount = existing.amount.plus(value);
      else normalized.set(key, { ...target, amount: value });
    };

    for (const allocation of data.allocations) {
      let remaining = new Prisma.Decimal(allocation.amount);
      if (allocation.openingBalance) {
        if (remaining.greaterThan(openingRemaining)) throw new SupplierDomainError("Payment exceeds the remaining supplier opening balance.");
        openingRemaining = openingRemaining.minus(remaining);
        addNormalized("opening", { goodReceivedNoteId: null, purchaseOrderId: null, isSupplierOpeningBalance: true }, remaining);
        continue;
      }

      if (allocation.goodReceivedNoteId) {
        const target = grnById.get(allocation.goodReceivedNoteId);
        const capacity = grnRemaining.get(allocation.goodReceivedNoteId);
        if (!target || !capacity) throw new SupplierDomainError("One or more GRNs are unavailable or already settled.");
        if (remaining.greaterThan(capacity)) throw new SupplierDomainError(`Payment exceeds outstanding amount for ${target.grnNumber}.`);
        grnRemaining.set(target.id, capacity.minus(remaining));
        addNormalized(`grn:${target.id}`, { goodReceivedNoteId: target.id, purchaseOrderId: target.purchaseOrderId, isSupplierOpeningBalance: false }, remaining);
        continue;
      }

      // Compatibility for old callers/tests: a legacy PO request is never persisted
      // as a PO-only settlement. It is normalized FIFO into the PO's surviving GRNs.
      const poTargets = snapshot.grns.filter((grn) => grn.purchaseOrderId === allocation.purchaseOrderId && (grnRemaining.get(grn.id)?.gt(0) ?? false));
      if (!poTargets.length) throw new SupplierDomainError("This purchase has no unpaid active GRNs. Supplier payments must be settled against GRNs.");
      for (const target of poTargets) {
        if (remaining.lte(0)) break;
        const capacity = grnRemaining.get(target.id) ?? new Prisma.Decimal(0);
        const applied = Prisma.Decimal.min(capacity, remaining);
        if (applied.lte(0)) continue;
        grnRemaining.set(target.id, capacity.minus(applied));
        remaining = remaining.minus(applied);
        addNormalized(`grn:${target.id}`, { goodReceivedNoteId: target.id, purchaseOrderId: target.purchaseOrderId, isSupplierOpeningBalance: false }, applied);
      }
      if (remaining.gt(0)) throw new SupplierDomainError("Payment exceeds the unpaid GRN liability for this purchase.");
    }

    const number = await nextDocumentNumber(tx, context.workspaceId, "BANK_PAYMENT_VOUCHER");
    const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, supplierId, cashBankAccountId: cashBankAccount.id, documentNumber: number, idempotencyKey: data.idempotencyKey, amount, netAmount, withholdingTaxAmount, method: data.method, reference: data.reference || null, notes: data.notes || null, paymentDate: data.paymentDate } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId, type: "PAYMENT_MADE", debit: amount, description: `Supplier payment ${number}`, referenceId: payment.id, date: data.paymentDate } });
    await tx.supplier.update({ where: { id: supplierId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: amount } } });
    await postSupplierPaymentToGeneralLedger(tx, { workspaceId: context.workspaceId, paymentId: payment.id, documentNo: number, date: data.paymentDate, amount, withholdingTaxAmount, cashBankAccountId: cashBankAccount.id });

    const purchaseTotals = new Map<string, Prisma.Decimal>();
    for (const allocation of normalized.values()) {
      await tx.paymentAllocation.create({
        data: {
          workspaceId: context.workspaceId,
          paymentId: payment.id,
          purchaseOrderId: allocation.purchaseOrderId,
          goodReceivedNoteId: allocation.goodReceivedNoteId,
          isSupplierOpeningBalance: allocation.isSupplierOpeningBalance,
          amount: allocation.amount,
        },
      });
      if (allocation.purchaseOrderId) purchaseTotals.set(allocation.purchaseOrderId, (purchaseTotals.get(allocation.purchaseOrderId) ?? new Prisma.Decimal(0)).plus(allocation.amount));
    }

    for (const [purchaseOrderId, settled] of purchaseTotals) {
      const purchase = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, workspaceId: context.workspaceId, supplierId, status: { not: "CANCELLED" } }, select: { id: true, balanceAmount: true } });
      if (!purchase || settled.greaterThan(purchase.balanceAmount)) throw new SupplierDomainError("Payment exceeds the current GRN-backed purchase liability.");
      await tx.purchaseOrder.update({ where: { id: purchaseOrderId, workspaceId: context.workspaceId }, data: { paidAmount: { increment: settled }, balanceAmount: { decrement: settled } } });
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "supplier.payment_recorded",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        supplierId,
        amount: data.amount,
        withholdingTaxAmount: withholdingTaxAmount.toString(),
        netAmount: netAmount.toString(),
        documentNumber: number,
        allocations: Array.from(normalized.values()).map((allocation) => ({ goodReceivedNoteId: allocation.goodReceivedNoteId, openingBalance: allocation.isSupplierOpeningBalance, amount: allocation.amount.toString() })),
      },
    });
    return { id: payment.id };
  });
}

export async function getSupplierPaymentVoucher(workspaceId: string, paymentId: string) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, workspaceId, supplierId: { not: null } },
    include: {
      supplier: true,
      cashBankAccount: { include: { account: true } },
      allocations: { include: { purchaseOrder: true, goodReceivedNote: true } },
      workspace: true,
    },
  });
  if (!payment) return null;
  return {
    id: payment.id,
    documentNumber: payment.documentNumber ?? payment.reference ?? "Supplier Payment",
    paymentDate: payment.paymentDate.toISOString(),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    grossAmount: Number(payment.amount),
    withholdingTaxAmount: Number(payment.withholdingTaxAmount),
    netAmount: Number(payment.netAmount ?? payment.amount.minus(payment.withholdingTaxAmount)),
    supplier: payment.supplier ? { name: payment.supplier.name, companyName: payment.supplier.companyName, phone: payment.supplier.phone, address: payment.supplier.address, city: payment.supplier.city } : null,
    cashBankAccount: payment.cashBankAccount ? { name: payment.cashBankAccount.name, code: payment.cashBankAccount.account.code, isBank: payment.cashBankAccount.isBank, bankName: payment.cashBankAccount.bankName, accountTitle: payment.cashBankAccount.accountTitle, accountNumber: payment.cashBankAccount.accountNumber } : null,
    workspace: { name: payment.workspace.name, phone: payment.workspace.phone, email: payment.workspace.email, address: payment.workspace.address, city: payment.workspace.city, country: payment.workspace.country, ntn: payment.workspace.ntn, strn: payment.workspace.strn },
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: Number(allocation.amount),
      targetType: allocation.isSupplierOpeningBalance ? "OPENING_BALANCE" as const : allocation.goodReceivedNote ? "GRN" as const : "LEGACY_PURCHASE" as const,
      reference: allocation.isSupplierOpeningBalance ? "Opening Balance" : allocation.goodReceivedNote?.grnNumber ?? allocation.purchaseOrder?.orderNumber ?? "-",
      date: allocation.goodReceivedNote?.receiptDate.toISOString() ?? allocation.purchaseOrder?.orderDate.toISOString() ?? null,
      purchaseOrder: allocation.purchaseOrder ? { orderNumber: allocation.purchaseOrder.orderNumber, orderDate: allocation.purchaseOrder.orderDate.toISOString(), totalAmount: Number(allocation.purchaseOrder.totalAmount) } : null,
      goodReceivedNote: allocation.goodReceivedNote ? { grnNumber: allocation.goodReceivedNote.grnNumber, receiptDate: allocation.goodReceivedNote.receiptDate.toISOString(), totalAmount: Number(allocation.goodReceivedNote.totalAmount) } : null,
    })),
  };
}
