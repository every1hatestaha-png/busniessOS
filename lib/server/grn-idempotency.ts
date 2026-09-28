import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import type { GoodsReceiptInput } from "@/lib/validation/purchase";

function optionalDecimalMatches(stored: Prisma.Decimal | null, requested: number | undefined) {
  return requested === undefined ? stored === null : Boolean(stored?.equals(requested));
}

export async function goodsReceiptMatchesRequest(workspaceId: string, grnId: string, input: GoodsReceiptInput) {
  const stored = await db.goodReceivedNote.findFirst({
    where: { id: grnId, workspaceId },
    select: {
      purchaseOrderId: true,
      receiptDate: true,
      notes: true,
      receivedBy: true,
      checkedBy: true,
      warehouseId: true,
      idempotencyKey: true,
      items: {
        select: {
          purchaseOrderItemId: true,
          receivedQuantity: true,
          acceptedQuantity: true,
          unitCost: true,
          receivedWeightKg: true,
          acceptedWeightKg: true,
          ratePerKg: true,
        },
      },
    },
  });
  if (!stored) return false;

  const sameHeader = stored.purchaseOrderId === input.purchaseOrderId
    && stored.idempotencyKey === (input.idempotencyKey ?? null)
    && (stored.notes ?? "") === (input.notes ?? "")
    && (stored.receivedBy ?? "") === (input.receivedBy ?? "")
    && (stored.checkedBy ?? "") === (input.checkedBy ?? "")
    && (stored.warehouseId ?? "") === (input.warehouseId ?? "")
    && (input.receiptDate === undefined || stored.receiptDate.getTime() === input.receiptDate.getTime());
  if (!sameHeader) return false;

  const requestedIds = input.items.map((item) => item.purchaseOrderItemId);
  if (new Set(requestedIds).size !== requestedIds.length || stored.items.length !== input.items.length) return false;

  return input.items.every((requested) => {
    const item = stored.items.find((candidate) => candidate.purchaseOrderItemId === requested.purchaseOrderItemId);
    return Boolean(item
      && item.receivedQuantity.equals(requested.receivedQuantity)
      && item.acceptedQuantity.equals(requested.acceptedQuantity)
      && item.unitCost.equals(requested.actualUnitCost)
      && optionalDecimalMatches(item.receivedWeightKg, requested.receivedWeightKg)
      && optionalDecimalMatches(item.acceptedWeightKg, requested.acceptedWeightKg)
      && optionalDecimalMatches(item.ratePerKg, requested.ratePerKg));
  });
}
