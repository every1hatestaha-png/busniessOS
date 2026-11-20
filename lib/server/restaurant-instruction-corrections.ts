import "server-only";

import { type Role } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = new Set<Role>(["OWNER", "ADMIN", "MANAGER"]);

/**
 * Controlled preparation-note correction. Unlike an item/quantity amendment,
 * it never changes accounting, payment, KOT lines or ingredient stock.
 * It updates the order note read by kitchen on its visible-tab refresh.
 */
export async function correctRestaurantKitchenInstructions(
  context: IndustryContext,
  orderId: string,
  expectedPreviousNote: string,
  newNoteInput: string,
  reasonInput: string,
) {
  if (!MANAGERS.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Only managers can amend kitchen instructions.");
  }
  if (!context.userId || !UUID.test(context.userId) || !UUID.test(orderId)) {
    throw new IndustryDomainError("INVALID_STATE", "The manager or order is invalid.");
  }
  if (typeof newNoteInput !== "string" || newNoteInput.length > 500 || typeof expectedPreviousNote !== "string" || expectedPreviousNote.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Kitchen instructions must be 500 characters or fewer.");
  }
  const newNotes = newNoteInput.trim();
  const reason = reasonInput.trim();
  if (reason.length < 5 || reason.length > 250) {
    throw new IndustryDomainError("INVALID_STATE", "A correction reason of 5 to 250 characters is required.");
  }
  await requireWorkspaceModule(context.workspaceId, "restaurant");

  return withSerializableRetry(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string; orderNumber: string; status: string; notes: string | null;
    }>>`
      SELECT "id"::text AS "id", "orderNumber", "status", "notes"
      FROM "restaurant_orders"
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "id"=${orderId}::uuid
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "This order does not belong to the restaurant.");
    if (!["CONFIRMED", "PREPARING"].includes(order.status)) {
      throw new IndustryDomainError("INVALID_STATE", "Only confirmed or preparing orders can receive amended instructions.");
    }
    const previous = order.notes ?? "";
    if (previous !== expectedPreviousNote) {
      throw new IndustryDomainError("CONFLICT", "Another manager updated these instructions. Refresh the order before saving.");
    }
    if (previous === newNotes) {
      return { updated: false, orderNumber: order.orderNumber };
    }
    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "notes"=${newNotes || null}, "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "id"=${order.id}::uuid
    `;
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.order.kitchen_instructions_corrected",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        status: order.status,
        before: previous, after: newNotes, reason,
      },
    });
    return { updated: true, orderNumber: order.orderNumber };
  });
}
