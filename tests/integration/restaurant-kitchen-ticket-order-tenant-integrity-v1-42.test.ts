import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const orderA = randomUUID();
const orderB = randomUUID();
const ticketA = randomUUID();
const ticketNumberA = `V142-A-${runId}`;

async function ticketParent(ticketId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; restaurantOrderId: string | null }>>`
    SELECT "workspaceId"::text, "restaurantOrderId"::text
    FROM "kitchen_tickets"
    WHERE "id"=${ticketId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.42 kitchen ticket order tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await db.$executeRaw`
      INSERT INTO "restaurant_orders" (
        "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES
        (${orderA}::uuid, ${workspaceA}::uuid, ${`V142-ORDER-A-${runId}`}, 'MANUAL', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0),
        (${orderB}::uuid, ${workspaceB}::uuid, ${`V142-ORDER-B-${runId}`}, 'MANUAL', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0)
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "ticketNumber" LIKE ${`V142-%-${runId}`}`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "id" IN (${orderA}::uuid, ${orderB}::uuid)`;
    await db.$disconnect();
  }, 60_000);

  it("allows a kitchen ticket to reference an order from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "id", "workspaceId", "restaurantOrderId", "ticketNumber", "status"
      ) VALUES (
        ${ticketA}::uuid, ${workspaceA}::uuid, ${orderA}::uuid, ${ticketNumberA}, 'QUEUED'
      )
    `).resolves.toBe(1);

    expect(await ticketParent(ticketA)).toEqual({
      workspaceId: workspaceA,
      restaurantOrderId: orderA,
    });
  }, 60_000);

  it("rejects a forged cross-workspace restaurantOrderId on INSERT", async () => {
    const forgedTicket = randomUUID();
    const forgedNumber = `V142-FORGED-${runId}`;

    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "id", "workspaceId", "restaurantOrderId", "ticketNumber", "status"
      ) VALUES (
        ${forgedTicket}::uuid, ${workspaceA}::uuid, ${orderB}::uuid, ${forgedNumber}, 'QUEUED'
      )
    `).rejects.toThrow("Kitchen ticket order must belong to the same workspace");

    expect(await ticketParent(forgedTicket)).toBeUndefined();
  }, 60_000);

  it("rejects a forged cross-workspace restaurantOrderId on UPDATE and preserves the original parent", async () => {
    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "restaurantOrderId"=${orderB}::uuid
      WHERE "id"=${ticketA}::uuid
    `).rejects.toThrow("Kitchen ticket order must belong to the same workspace");

    expect(await ticketParent(ticketA)).toEqual({
      workspaceId: workspaceA,
      restaurantOrderId: orderA,
    });
  }, 60_000);
});
