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

describe("restaurant V1.77 posting evidence", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createPosRestaurantOrder: createOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    const { createRestaurantMenuCategory, createRestaurantMenuItem } = await import("@/lib/server/restaurant-workspace");

    const user = await db.user.create({
      data: { clerkId: `v177-${runId}`, email: `v177-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Posting evidence ${runId}`,
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
        name: "V1.77 meal",
        sku: `V177-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(actor(), { name: `V1.77 ${runId}` });
    const item = await createRestaurantMenuItem(actor(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.77 meal",
      price: 200,
    });
    menuItemId = item.id;

    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'restaurant_v177_app') THEN
          CREATE ROLE restaurant_v177_app NOLOGIN;
        END IF;
      END
      $$
    `);
    await db.$executeRawUnsafe('GRANT SELECT, DELETE ON TABLE "general_ledger_entries", "inventory_transactions" TO restaurant_v177_app');
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures remain until the isolated CI database is discarded.
    if (db) await db.$disconnect();
  });

  it("freezes Restaurant ledger and inventory postings and blocks application-role deletion", async () => {
    const order = await createOrder(actor(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
      await transition(actor(), order.id, status);
    }

    const ledgerRows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "general_ledger_entries"
      WHERE "workspaceId"=${workspaceId} AND "sourceType"='SALE' AND "sourceId"=${order.id}
      ORDER BY "id" LIMIT 1
    `;
    const inventoryRows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "inventory_transactions"
      WHERE "workspaceId"=${workspaceId} AND "reference"=${`RESTAURANT:${order.id}`}
      ORDER BY "id" LIMIT 1
    `;
    const ledgerId = ledgerRows[0]!.id;
    const inventoryId = inventoryRows[0]!.id;

    await expect(db.$executeRaw`
      UPDATE "general_ledger_entries" SET "narration"='rewritten' WHERE "id"=${ledgerId}
    `).rejects.toThrow("Restaurant general ledger evidence is immutable");
    await expect(db.$executeRaw`
      UPDATE "inventory_transactions" SET "quantityChanged"="quantityChanged" + 1 WHERE "id"=${inventoryId}
    `).rejects.toThrow("Restaurant inventory transaction evidence is immutable");

    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE restaurant_v177_app");
      await tx.$executeRaw`DELETE FROM "general_ledger_entries" WHERE "id"=${ledgerId}`;
    })).rejects.toThrow("Restaurant general ledger evidence cannot be deleted");
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE restaurant_v177_app");
      await tx.$executeRaw`DELETE FROM "inventory_transactions" WHERE "id"=${inventoryId}`;
    })).rejects.toThrow("Restaurant inventory transaction evidence cannot be deleted");

    expect(await db.generalLedgerEntry.count({ where: { id: ledgerId } })).toBe(1);
    expect(await db.inventoryTransaction.count({ where: { id: inventoryId } })).toBe(1);
  }, 60_000);
});
