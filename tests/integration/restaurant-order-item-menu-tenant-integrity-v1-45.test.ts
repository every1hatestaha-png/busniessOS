import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const categoryA = randomUUID();
const categoryB = randomUUID();
const menuA = randomUUID();
const menuB = randomUUID();
const orderA = randomUUID();
const orderB = randomUUID();
const itemA = randomUUID();

async function orderItemParent(itemId: string) {
  const rows = await db.$queryRaw<Array<{ restaurantOrderId: string; menuItemId: string | null }>>`
    SELECT "restaurantOrderId"::text, "menuItemId"::text
    FROM "restaurant_order_items"
    WHERE "id"=${itemId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.45 order item menu tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Order menu A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Order menu B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_categories" ("id", "workspaceId", "name")
      VALUES
        (${categoryA}::uuid, ${workspaceA}::uuid, ${`V145-CAT-A-${runId}`}),
        (${categoryB}::uuid, ${workspaceB}::uuid, ${`V145-CAT-B-${runId}`})
    `;

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_items" ("id", "workspaceId", "categoryId", "name", "price")
      VALUES
        (${menuA}::uuid, ${workspaceA}::uuid, ${categoryA}::uuid, ${`V145-MENU-A-${runId}`}, 0),
        (${menuB}::uuid, ${workspaceB}::uuid, ${categoryB}::uuid, ${`V145-MENU-B-${runId}`}, 0)
    `;

    await db.$executeRaw`
      INSERT INTO "restaurant_orders" (
        "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES
        (${orderA}::uuid, ${workspaceA}::uuid, ${`V145-ORDER-A-${runId}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0),
        (${orderB}::uuid, ${workspaceB}::uuid, ${`V145-ORDER-B-${runId}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0)
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "id"=${itemA}::uuid OR "itemName" LIKE ${`V145-%-${runId}`}`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "id" IN (${orderA}::uuid, ${orderB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "id" IN (${menuA}::uuid, ${menuB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "id" IN (${categoryA}::uuid, ${categoryB}::uuid)`;
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows an order item to reference a menu item from the order workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_order_items" (
        "id", "restaurantOrderId", "menuItemId", "itemName", "quantity", "unitPrice", "lineTotal"
      ) VALUES (
        ${itemA}::uuid, ${orderA}::uuid, ${menuA}::uuid, ${`V145-A-${runId}`}, 1, 0, 0
      )
    `).resolves.toBe(1);

    expect(await orderItemParent(itemA)).toEqual({ restaurantOrderId: orderA, menuItemId: menuA });
  }, 60_000);

  it("rejects a forged cross-workspace menuItemId on INSERT", async () => {
    const forgedItem = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_order_items" (
        "id", "restaurantOrderId", "menuItemId", "itemName", "quantity", "unitPrice", "lineTotal"
      ) VALUES (
        ${forgedItem}::uuid, ${orderA}::uuid, ${menuB}::uuid, ${`V145-FORGED-${runId}`}, 1, 0, 0
      )
    `).rejects.toThrow("Restaurant order item menu item must belong to the same workspace");

    expect(await orderItemParent(forgedItem)).toBeUndefined();
  }, 60_000);

  it("rejects moving an immutable order item to a cross-workspace menu item and preserves the snapshot", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "menuItemId"=${menuB}::uuid
      WHERE "id"=${itemA}::uuid
    `).rejects.toThrow("Restaurant order item menu item must belong to the same workspace");

    expect(await orderItemParent(itemA)).toEqual({ restaurantOrderId: orderA, menuItemId: menuA });
  }, 60_000);
});
