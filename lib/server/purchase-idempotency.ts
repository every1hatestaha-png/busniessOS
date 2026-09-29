import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import type { PurchaseInput } from "@/lib/validation/purchase";

export async function purchaseMatchesRequest(workspaceId: string, purchaseId: string, input: PurchaseInput) {
  const purchase = await db.purchaseOrder.findFirst({
    where: { id: purchaseId, workspaceId },
    select: {
      supplierId: true,
      notes: true,
      expectedDeliveryDate: true,
      department: true,
      pricingMode: true,
      idempotencyKey: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          unitCost: true,
          unitWeight: true,
          perKgRate: true,
        },
      },
    },
  });
  if (!purchase) return false;

  const requestedMode = input.pricingMode ?? "UNIT";
  const requestedProductIds = input.items.map((item) => item.productId);
  if (new Set(requestedProductIds).size !== requestedProductIds.length) return false;

  const sameHeader = purchase.supplierId === input.supplierId
    && purchase.pricingMode === requestedMode
    && purchase.idempotencyKey === input.idempotencyKey
    && (purchase.notes ?? "") === (input.notes ?? "")
    && (purchase.department ?? "") === (input.department ?? "")
    && (purchase.expectedDeliveryDate?.getTime() ?? null) === (input.expectedDeliveryDate?.getTime() ?? null);
  if (!sameHeader || purchase.items.length !== input.items.length) return false;

  const storedByProduct = new Map(purchase.items.map((item) => [item.productId, item]));
  return input.items.every((requested) => {
    const stored = storedByProduct.get(requested.productId);
    if (!stored) return false;

    const requestedUnitCost = requestedMode === "WEIGHT"
      ? new Prisma.Decimal(requested.unitWeight!).mul(requested.perKgRate!)
      : new Prisma.Decimal(requested.unitCost);

    return stored.quantity.equals(requested.quantity)
      && stored.unitCost.equals(requestedUnitCost)
      && (requestedMode !== "WEIGHT" || (
        new Prisma.Decimal(stored.unitWeight ?? 0).equals(requested.unitWeight!)
        && new Prisma.Decimal(stored.perKgRate ?? 0).equals(requested.perKgRate!)
      ));
  });
}
