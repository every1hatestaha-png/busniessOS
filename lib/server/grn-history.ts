import "server-only";

import { db } from "@/lib/server/db";
import { getGoodsReceipt } from "@/lib/server/purchases";

/**
 * Returns a GRN with history calculated from surviving ACTIVE GRNs that
 * existed before this record. Voided or deleted GRNs never contribute to
 * the "previously accepted" values.
 *
 * This also makes historical GRNs stable with respect to later receipts:
 * opening GRN #1 after GRN #2 exists will still show GRN #1 as the first
 * receipt, rather than deriving its history from the PO's current total.
 */
export async function getGoodsReceiptWithHistory(workspaceId: string, id: string) {
  const [grn, current] = await Promise.all([
    getGoodsReceipt(workspaceId, id),
    db.goodReceivedNote.findFirst({
      where: { id, workspaceId },
      select: { createdAt: true, purchaseOrderId: true },
    }),
  ]);

  if (!grn || !current) return null;

  const previousReceipts = await db.goodReceivedNote.findMany({
    where: {
      workspaceId,
      purchaseOrderId: current.purchaseOrderId,
      status: "ACTIVE",
      createdAt: { lt: current.createdAt },
    },
    select: {
      id: true,
      items: {
        select: {
          purchaseOrderItemId: true,
          acceptedQuantity: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const previousAcceptedByItem = new Map<string, number>();
  for (const receipt of previousReceipts) {
    for (const item of receipt.items) {
      previousAcceptedByItem.set(
        item.purchaseOrderItemId,
        (previousAcceptedByItem.get(item.purchaseOrderItemId) ?? 0) + item.acceptedQuantity.toNumber(),
      );
    }
  }

  return {
    ...grn,
    hasPreviousReceipt: previousReceipts.length > 0,
    items: grn.items.map((item) => {
      const previouslyReceived = previousAcceptedByItem.get(item.purchaseOrderItemId) ?? 0;
      return {
        ...item,
        previouslyReceived,
        remainingQuantity: Math.max(0, item.orderedQuantity - previouslyReceived - item.acceptedQuantity),
      };
    }),
  };
}
