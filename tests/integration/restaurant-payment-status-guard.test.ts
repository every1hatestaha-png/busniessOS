import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let setRestaurantOrderPaymentStatus: typeof import("@/lib/server/restaurant-workspace")["setRestaurantOrderPaymentStatus"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("restaurant payment status database guard", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder, setRestaurantOrderPaymentStatus } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `restaurant-payment-guard-${runId}`, email: `restaurant-payment-guard-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Restaurant Payment Guard ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
      ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
    `;
    const product = await db.product.create({
      data: { workspaceId, name: "Guard Product", sku: `G-${runId}`, stockQuantity: 10, costPrice: 10, sellingPrice: 100 },
    });
    const category = await createRestaurantMenuCategory(context(), { name: "Guard Menu" });
    const menuItem = await createRestaurantMenuItem(context(), {
      categoryId: category.id,
      productId: product.id,
      name: "Guard Item",
      price: 100,
    });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects manual payment status tampering when no active payment supports it", async () => {
    const order = await createPosRestaurantOrder(context(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(setRestaurantOrderPaymentStatus(context(), order.id, "PAID")).rejects.toThrow(
      "Restaurant payment status must be derived from active payments",
    );

    const rows = await db.$queryRaw<Array<{ paymentStatus: string }>>`
      SELECT "paymentStatus" FROM "restaurant_orders"
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(rows[0]?.paymentStatus).toBe("UNPAID");
  });
});
