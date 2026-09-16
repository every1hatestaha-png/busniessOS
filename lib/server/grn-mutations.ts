import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";
import {
  PurchaseDomainError,
  updateGoodsReceipt,
  voidGoodsReceipt,
} from "@/lib/server/purchases";
import {
  updateGoodsReceiptSchema,
  voidGoodsReceiptSchema,
  type UpdateGoodsReceiptInput,
  type VoidGoodsReceiptInput,
} from "@/lib/validation/purchase";

async function activeDirectSettlement(workspaceId: string, grnId: string) {
  const settled = await db.paymentAllocation.aggregate({
    where: {
      workspaceId,
      goodReceivedNoteId: grnId,
      payment: { isReversed: false, reversalOfId: null },
    },
    _sum: { amount: true },
  });
  return new Prisma.Decimal(settled._sum.amount ?? 0);
}

async function syncReceiptDate(workspaceId: string, grnId: string, receiptDate: Date) {
  await db.$transaction([
    db.goodReceivedNote.update({
      where: { id: grnId, workspaceId },
      data: { receiptDate },
    }),
    db.ledgerEntry.updateMany({
      where: {
        workspaceId,
        referenceId: grnId,
        type: "GOODS_RECEIVED",
        description: { startsWith: "Goods received " },
      },
      data: { date: receiptDate },
    }),
    db.generalLedgerEntry.updateMany({
      where: {
        workspaceId,
        sourceType: "PURCHASE_RECEIPT",
        sourceId: grnId,
        reversedAt: null,
      },
      data: { date: receiptDate },
    }),
  ]);
}

function proposedReceiptTotal(
  pricingMode: "UNIT" | "WEIGHT",
  items: NonNullable<UpdateGoodsReceiptInput["items"]>,
) {
  return items.reduce((sum, item) => {
    if (pricingMode === "WEIGHT") {
      if (item.acceptedWeightKg == null || item.ratePerKg == null) {
        throw new PurchaseDomainError(
          "INVALID_RECEIPT",
          "Accepted weight and rate per kg are required when editing a weight-priced GRN.",
        );
      }
      return sum.plus(new Prisma.Decimal(item.acceptedWeightKg).mul(item.ratePerKg));
    }
    return sum.plus(new Prisma.Decimal(item.acceptedQuantity).mul(item.actualUnitCost));
  }, new Prisma.Decimal(0));
}

/**
 * Integrity wrapper for GRN edits.
 *
 * The underlying purchase service already reverses/reapplies stock, WAC, PO progress,
 * supplier balance, inventory transactions, supplier ledger deltas and GL journals.
 * This wrapper adds the settlement floor introduced by GRN-level supplier payments and
 * synchronizes an edited receipt date to the canonical GRN/ledger/active GL posting.
 */
export async function updateGoodsReceiptWithIntegrity(
  context: ServiceContext,
  id: string,
  input: UpdateGoodsReceiptInput,
) {
  const data = updateGoodsReceiptSchema.parse(input);
  const grn = await db.goodReceivedNote.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      purchaseOrderId: true,
      purchaseOrder: {
        select: {
          status: true,
          pricingMode: true,
          balanceAmount: true,
        },
      },
    },
  });
  if (!grn) throw new PurchaseDomainError("GRN_NOT_FOUND", "Goods receipt not found.");
  if (grn.status !== "ACTIVE") throw new PurchaseDomainError("CANNOT_MODIFY_GRN", "Cannot modify a voided goods receipt.");

  if (data.items) {
    const proposedTotal = proposedReceiptTotal(grn.purchaseOrder.pricingMode, data.items);
    const directlySettled = await activeDirectSettlement(context.workspaceId, id);
    if (proposedTotal.lessThan(directlySettled)) {
      throw new PurchaseDomainError(
        "PURCHASE_HAS_PAYMENTS",
        `Cannot reduce this GRN below its already-settled amount (${directlySettled.toFixed(2)}). Reverse or reallocate the supplier payment first.`,
      );
    }

    const totalDelta = proposedTotal.minus(grn.totalAmount);
    const projectedPurchaseBalance = new Prisma.Decimal(grn.purchaseOrder.balanceAmount).plus(totalDelta);
    if (projectedPurchaseBalance.isNegative()) {
      throw new PurchaseDomainError(
        "PURCHASE_HAS_PAYMENTS",
        "Cannot reduce this GRN because supplier payments or returns already settle the affected purchase liability. Reverse the dependent settlement first.",
      );
    }
  }

  const { receiptDate, ...serviceInput } = data;
  const updated = await updateGoodsReceipt(context, id, serviceInput);

  if (receiptDate) {
    await syncReceiptDate(context.workspaceId, id, receiptDate);
  }

  return updated;
}

/**
 * Blocks void/delete semantics while a live payment is allocated directly to the GRN.
 * Historical/reversed payments do not block reversal of the receipt.
 */
export async function voidGoodsReceiptWithIntegrity(
  context: ServiceContext,
  id: string,
  input: VoidGoodsReceiptInput,
) {
  const data = voidGoodsReceiptSchema.parse(input);
  const grn = await db.goodReceivedNote.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, status: true },
  });
  if (!grn) throw new PurchaseDomainError("GRN_NOT_FOUND", "Goods receipt not found.");

  const directlySettled = await activeDirectSettlement(context.workspaceId, id);
  if (directlySettled.greaterThan(0)) {
    throw new PurchaseDomainError(
      "PURCHASE_HAS_PAYMENTS",
      `Cannot void this GRN while ${directlySettled.toFixed(2)} is allocated to it. Reverse the supplier payment first.`,
    );
  }

  return voidGoodsReceipt(context, id, data);
}

/**
 * User-facing delete is an accounting-safe soft delete: ACTIVE receipts are voided and
 * fully reversed instead of being physically removed. VOIDED receipts are idempotently
 * treated as already deleted so audit/history remains intact while operational totals stay clean.
 */
export async function deleteGoodsReceiptWithIntegrity(context: ServiceContext, id: string) {
  const grn = await db.goodReceivedNote.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, status: true },
  });
  if (!grn) throw new PurchaseDomainError("GRN_NOT_FOUND", "Goods receipt not found.");
  if (grn.status === "VOIDED") return { id: grn.id, status: "VOIDED" as const };

  return voidGoodsReceiptWithIntegrity(context, id, { voidedReason: "Deleted by user" });
}
