import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];

const runId = randomUUID();
let workspaceId = "";
let userId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function newOrder() {
  return createOrder(actor(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
}

describe("restaurant V1.76 terminal evidence", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createPosRestaurantOrder: createOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    const { createRestaurantMenuCategory, createRestaurantMenuItem } = await import("@/lib/server/restaurant-workspace");

    const user = await db.user.create({
      data: { clerkId: `v176-${runId}`, email: `v176-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Terminal evidence ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.76 meal",
        sku: `V176-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(actor(), { name: `V1.76 ${runId}` });
    const item = await createRestaurantMenuItem(actor(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.76 meal",
      price: 200,
    });
    menuItemId = item.id;

    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'restaurant_v176_app') THEN
          CREATE ROLE restaurant_v176_app NOLOGIN;
        END IF;
      END
      $$
    `);
    await db.$executeRawUnsafe('GRANT SELECT, DELETE ON TABLE "kitchen_tickets" TO restaurant_v176_app');
  }, 60_000);

  afterAll(async () => {
    // Immutable operational fixtures remain until the isolated CI database is discarded.
    if (db) await db.$disconnect();
  });

  it("rejects direct terminal kitchen-ticket creation", async () => {
    const order = await newOrder();
    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "workspaceId", "restaurantOrderId", "ticketNumber", "status", "startedAt", "readyAt", "servedAt"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${`V176-FORGED-${runId}`}, 'SERVED', now(), now(), now()
      )
    `).rejects.toThrow("Restaurant kitchen ticket must be inserted in the QUEUED state");
  });

  it("freezes terminal kitchen-ticket evidence and blocks application-role deletion", async () => {
    const order = await newOrder();
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
      await transition(actor(), order.id, status);
    }
    const tickets = await db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id"::text AS "id", "status" FROM "kitchen_tickets"
      WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    const ticket = tickets[0]!;
    expect(ticket.status).toBe("SERVED");

    for (const rewrite of [
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "notes"='rewritten' WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "updatedAt"=now() + interval '1 second' WHERE "id"=${ticket.id}::uuid`,
    ]) {
      await expect(rewrite()).rejects.toThrow("Terminal restaurant kitchen ticket snapshot is immutable");
    }
    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='READY' WHERE "id"=${ticket.id}::uuid
    `).rejects.toThrow("Invalid restaurant kitchen ticket status transition from SERVED to READY");

    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE restaurant_v176_app");
      await tx.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "id"=${ticket.id}::uuid`;
    })).rejects.toThrow("Restaurant kitchen ticket history cannot be deleted");
  }, 60_000);

  it("freezes restaurant-order cancellation evidence", async () => {
    const order = await newOrder();
    await transition(actor(), order.id, "CANCELLED");
    const rows = await db.$queryRaw<Array<{ cancelledAt: Date | null }>>`
      SELECT "cancelledAt" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]!.cancelledAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "cancelledAt"=NULL WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order cancellation evidence is immutable once recorded");
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "cancelledAt"="cancelledAt" + interval '1 second' WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order cancellation evidence is immutable once recorded");
  });
});
