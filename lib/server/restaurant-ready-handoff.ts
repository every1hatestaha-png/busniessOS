import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule } from "@/lib/server/industry-modules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cashier handoff only. Read actual Kitchen READY evidence, not order creation
 * time. No ticket price, guest identity, bank or payment column is selected.
 */
export async function listRestaurantReadyAtByOrderIds(
  workspaceId: string,
  orderIds: string[],
): Promise<Map<string, Date>> {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (!orderIds.length) return new Map();
  const unique = [...new Set(orderIds)];
  if (unique.length > 60 || unique.some(id => !UUID.test(id))) {
    throw new IndustryDomainError("INVALID_STATE", "Ready-order handoff selection is invalid.");
  }
  const ids = Prisma.join(unique.map(id => Prisma.sql`${id}::uuid`));
  const rows = await db.$queryRaw<Array<{ orderId: string; readyAt: Date }>>`
    SELECT ro."id"::text AS "orderId", MAX(kt."readyAt") AS "readyAt"
    FROM "restaurant_orders" ro
    JOIN "kitchen_tickets" kt
      ON kt."restaurantOrderId"=ro."id"
      AND kt."workspaceId"=ro."workspaceId"
    WHERE ro."workspaceId"=${workspaceId}::uuid
      AND ro."status"='READY'
      AND ro."id" IN (${ids})
      AND kt."status" IN ('READY','SERVED')
      AND kt."readyAt" IS NOT NULL
    GROUP BY ro."id"
  `;
  return new Map(rows.map(row => [row.orderId, row.readyAt]));
}

/** A clear, time-based service cue. Missing timestamps are never guessed. */
export function readyForServiceLabel(readyAt: Date | undefined, now: Date): {
  label: string; delayed: boolean;
} {
  if (!readyAt || !Number.isFinite(readyAt.getTime())) {
    return { label: "Ready, time unavailable", delayed: false };
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - readyAt.getTime()) / 60000));
  return {
    label: minutes < 1 ? "Ready just now" : `Ready for ${minutes} min`,
    delayed: minutes >= 10,
  };
}

/**
 * Prioritize orders by when Kitchen actually marked them READY. An absent
 * timestamp goes last, never creating a fictional delay or jumping the queue.
 * This sorts the bounded on-screen batch only; no database status changes.
 */
export function sortReadyOrderQueue<T extends { id: string; createdAt: Date }>(
  orders: readonly T[], readyTimes: ReadonlyMap<string, Date>,
): T[] {
  return [...orders].sort((a, b) => {
    const aAt = readyTimes.get(a.id)?.getTime();
    const bAt = readyTimes.get(b.id)?.getTime();
    const aValid = aAt !== undefined && Number.isFinite(aAt);
    const bValid = bAt !== undefined && Number.isFinite(bAt);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid && aAt !== bAt) return (aAt as number) - (bAt as number);
    return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}
