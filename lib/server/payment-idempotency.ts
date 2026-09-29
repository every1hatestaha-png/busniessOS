import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";

export type CustomerPaymentReplayRequest = {
  customerId: string;
  invoiceId?: string;
  cashBankAccountId?: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
  applyToOpeningBalance: boolean;
  amount: number;
  withholdingTaxAmount: number;
  paymentDate: Date;
  method: string;
  reference: string;
  notes: string;
  idempotencyKey?: string;
};

export type SupplierPaymentReplayRequest = {
  amount: number;
  withholdingTaxAmount: number;
  cashBankAccountId?: string;
  allocations: Array<{
    goodReceivedNoteId?: string;
    purchaseOrderId?: string;
    openingBalance: boolean;
    amount: number;
  }>;
  method: string;
  reference: string;
  notes: string;
  paymentDate: Date;
  idempotencyKey?: string;
};

function sameOptionalText(stored: string | null, requested: string) {
  return (stored ?? "") === requested;
}

export async function customerPaymentMatchesRequest(workspaceId: string, paymentId: string, request: CustomerPaymentReplayRequest) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, workspaceId },
    select: {
      customerId: true,
      supplierId: true,
      invoiceId: true,
      cashBankAccountId: true,
      amount: true,
      withholdingTaxAmount: true,
      paymentDate: true,
      method: true,
      reference: true,
      notes: true,
      idempotencyKey: true,
      allocations: { select: { invoiceId: true, amount: true, isCustomerOpeningBalance: true } },
    },
  });
  if (!payment) return false;

  const sameCore = payment.customerId === request.customerId
    && payment.supplierId === null
    && payment.amount.equals(request.amount)
    && payment.withholdingTaxAmount.equals(request.withholdingTaxAmount)
    && (payment.cashBankAccountId ?? "") === (request.cashBankAccountId ?? "")
    && payment.method === request.method
    && payment.paymentDate.getTime() === request.paymentDate.getTime()
    && sameOptionalText(payment.reference, request.reference)
    && sameOptionalText(payment.notes, request.notes)
    && (payment.idempotencyKey ?? undefined) === request.idempotencyKey;
  if (!sameCore) return false;

  if (request.applyToOpeningBalance) {
    return payment.allocations.length === 1
      && payment.allocations[0]!.isCustomerOpeningBalance
      && payment.allocations[0]!.invoiceId === null
      && payment.allocations[0]!.amount.equals(request.amount);
  }

  const requested = request.allocations?.length
    ? request.allocations
    : request.invoiceId
      ? [{ invoiceId: request.invoiceId, amount: request.amount }]
      : [];
  if (requested.length !== payment.allocations.length) return false;
  if (new Set(requested.map((allocation) => allocation.invoiceId)).size !== requested.length) return false;
  return requested.every((allocation) => payment.allocations.some((stored) =>
    !stored.isCustomerOpeningBalance
      && stored.invoiceId === allocation.invoiceId
      && stored.amount.equals(allocation.amount),
  ));
}

export async function supplierPaymentMatchesRequest(workspaceId: string, supplierId: string, paymentId: string, request: SupplierPaymentReplayRequest) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, workspaceId },
    select: {
      customerId: true,
      supplierId: true,
      cashBankAccountId: true,
      amount: true,
      withholdingTaxAmount: true,
      paymentDate: true,
      method: true,
      reference: true,
      notes: true,
      idempotencyKey: true,
      allocations: { select: { purchaseOrderId: true, goodReceivedNoteId: true, isSupplierOpeningBalance: true, amount: true } },
    },
  });
  if (!payment) return false;

  const sameCore = payment.customerId === null
    && payment.supplierId === supplierId
    && payment.amount.equals(request.amount)
    && payment.withholdingTaxAmount.equals(request.withholdingTaxAmount)
    && (payment.cashBankAccountId ?? "") === (request.cashBankAccountId ?? "")
    && payment.method === request.method
    && payment.paymentDate.getTime() === request.paymentDate.getTime()
    && sameOptionalText(payment.reference, request.reference)
    && sameOptionalText(payment.notes, request.notes)
    && (payment.idempotencyKey ?? undefined) === request.idempotencyKey;
  if (!sameCore) return false;

  if (request.allocations.length === 0) return payment.allocations.length === 0;
  const total = request.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
  if (!payment.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0)).equals(total)) return false;

  return request.allocations.every((requested) => {
    const matches = payment.allocations.filter((stored) => requested.openingBalance
      ? stored.isSupplierOpeningBalance
      : requested.goodReceivedNoteId
        ? stored.goodReceivedNoteId === requested.goodReceivedNoteId
        : stored.purchaseOrderId === requested.purchaseOrderId);
    return matches.reduce((sum, stored) => sum.plus(stored.amount), new Prisma.Decimal(0)).equals(requested.amount);
  });
}
