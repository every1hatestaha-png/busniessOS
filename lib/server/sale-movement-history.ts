import "server-only";
import { Prisma } from "@prisma/client";

/** Keep superseded movements and explicit offsets, leaving the live reference
 * exclusively for the current sale's historical-cost lookup. */
export async function preserveSupersededSaleMovements(tx: Prisma.TransactionClient, workspaceId: string, reference: string) {
  const movements = await tx.inventoryTransaction.findMany({ where: { workspaceId, reference, type: "SALE" } });
  for (const movement of movements) {
    const archivedReference = `EDIT:${reference}:${movement.id}`;
    await tx.inventoryTransaction.update({ where: { id: movement.id, workspaceId }, data: { reference: archivedReference } });
    await tx.inventoryTransaction.create({ data: {
      workspaceId,
      productId: movement.productId,
      type: "SALE_CANCELLATION",
      quantityChanged: movement.quantityChanged.negated(),
      unitCost: movement.unitCost,
      reference: archivedReference,
    } });
  }
}
