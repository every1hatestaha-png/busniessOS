import "server-only";

import { type Role } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { releaseRestaurantTableIfSettled } from "@/lib/server/restaurant-table-settlement";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = new Set<Role>(["OWNER", "ADMIN", "MANAGER"]);

/**
 * Display-only candidate list. Every mutation below revalidates table
 * availability and order status under serializable row locks.
 */
export async function listRestaurantTableTransferCandidates(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const orders = await db.$queryRaw<Array<{
    id: string; orderNumber: string; status: string; tableId: string; tableName: string; createdAt: Date;
  }>>`
    SELECT ro."id"::text AS "id", ro."orderNumber", ro."status",
           rt."id"::text AS "tableId", rt."name" AS "tableName", ro."createdAt"
    FROM "restaurant_orders" ro
    INNER JOIN "restaurant_tables" rt
      ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"
    WHERE ro."workspaceId"=${workspaceId}::uuid
      AND ro."fulfillmentType"='DINE_IN'
      AND ro."status" IN ('CONFIRMED', 'PREPARING', 'READY')
    ORDER BY ro."createdAt" DESC, ro."id" DESC
    LIMIT 100
  `;
  return orders;
}

/**
 * Move exactly ONE active dine-in order between tables.
 * No monetary, menu, inventory or order-status change is permitted.
 * A source table remains occupied if other orders/payment obligations still
 * reference it. This makes the operation safe with split/partial payments.
 */
export async function transferRestaurantDineInTable(
  context: IndustryContext,
  orderId: string,
  destinationTableId: string,
  reasonInput: string,
) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Only a restaurant manager can transfer a table.");
  }
  if (!context.userId || !UUID.test(context.userId)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "An authenticated manager is required.");
  }
  if (!UUID.test(orderId) || !UUID.test(destinationTableId)) {
    throw new IndustryDomainError("INVALID_STATE", "Choose a valid order and destination table.");
  }
  const reason = reasonInput.trim();
  if (reason.length < 5 || reason.length > 250) {
    throw new IndustryDomainError("INVALID_STATE", "Enter a transfer reason between 5 and 250 characters.");
  }
  await requireWorkspaceModule(context.workspaceId, "restaurant");

  return withSerializableRetry(async (tx) => {
    // Order-first lock matches terminal order transitions, preventing moves
    // after a concurrent READY -> COMPLETED or cancellation.
    const orders = await tx.$queryRaw<Array<{
      id: string; orderNumber: string; status: string; fulfillmentType: string; tableId: string | null;
    }>>`
      SELECT "id"::text AS "id", "orderNumber", "status", "fulfillmentType",
             "restaurantTableId"::text AS "tableId"
      FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "The restaurant order does not belong to this workspace.");
    if (order.fulfillmentType !== "DINE_IN" || !order.tableId) {
      throw new IndustryDomainError("INVALID_STATE", "Only dine-in orders assigned to a table can be moved.");
    }
    if (!["CONFIRMED", "PREPARING", "READY"].includes(order.status)) {
      throw new IndustryDomainError("INVALID_STATE", "This order is no longer active. Completed or cancelled orders cannot move.");
    }
    if (order.tableId === destinationTableId) {
      return { orderId: order.id, orderNumber: order.orderNumber, moved: false };
    }

    // Stable sorted lock order protects concurrent transfers swapping tables.
    const tables = await tx.$queryRaw<Array<{ id: string; name: string; status: string }>>`
      SELECT "id"::text AS "id", "name", "status"
      FROM "restaurant_tables"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "id" IN (${order.tableId}::uuid, ${destinationTableId}::uuid)
      ORDER BY "id"
      FOR UPDATE
    `;
    const source = tables.find(table => table.id === order.tableId);
    const target = tables.find(table => table.id === destinationTableId);
    if (!source || !target) {
      throw new IndustryDomainError("NOT_FOUND", "A selected table was not found in this restaurant.");
    }
    if (source.status !== "OCCUPIED") {
      throw new IndustryDomainError("CONFLICT", "Source table state changed. Refresh before transferring.");
    }
    if (target.status !== "AVAILABLE") {
      throw new IndustryDomainError("CONFLICT", "Destination table is unavailable. Choose another table.");
    }

    const occupied = await tx.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT restaurant_table_has_occupancy_blocker(
        ${destinationTableId}::uuid, ${context.workspaceId}::uuid
      ) AS "blocked"
    `;
    if (occupied[0]?.blocked !== false) {
      throw new IndustryDomainError("CONFLICT", "The destination has another active or unpaid restaurant order.");
    }

    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "restaurantTableId"=${destinationTableId}::uuid, "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "id"=${order.id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "restaurantTableId"=${destinationTableId}::uuid, "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantOrderId"=${order.id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "restaurant_tables"
      SET "status"='OCCUPIED', "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "id"=${destinationTableId}::uuid AND "status"='AVAILABLE'
    `;
    const released = await releaseRestaurantTableIfSettled(tx, context.workspaceId, source.id);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.table.transferred",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        fromTableId: source.id, fromTableName: source.name,
        toTableId: target.id, toTableName: target.name,
        reason, oldTableReleased: released.released,
      },
    });
    return { orderId: order.id, orderNumber: order.orderNumber, moved: true, destination: target.name };
  });
}
