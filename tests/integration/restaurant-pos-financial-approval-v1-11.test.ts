import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

const runId = randomUUID();
let workspaceId = "";
let managerId = "";
let staffId = "";
let menuItemId = "";

const manager = () => ({ workspaceId, role: "MANAGER" as const, userId: managerId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId: staffId });

describe("restaurant V1.11 POS financial override approval", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));

    const [managerUser, staffUser] = await Promise.all([
      db.user.create({ data: { clerkId: `pos-manager-${runId}`, email: `pos-manager-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `pos-staff-${runId}`, email: `pos-staff-${runId}@example.invalid` } }),
    ]);
    managerId = managerUser.id;
    staffId = staffUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `POS Approval ${runId}`,
        vertical: "LEGACY",
        members: {
          create: [
            { userId: managerId, role: "MANAGER" },
            { userId: staffId, role: "STAFF" },
          ],
        },
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
        name: "Approval Meal",
        sku: `POS-APP-${runId}`,
        stockQuantity: 20,
        costPrice: 100,
        sellingPrice: 500,
      },
    });
    const category = await createRestaurantMenuCategory(manager(), { name: "Approval Menu" });
    const menuItem = await createRestaurantMenuItem(manager(), {
      categoryId: category.id,
      productId: product.id,
      name: "Approval Meal",
      price: 500,
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
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [managerId, staffId] } } });
    await db.$disconnect();
  }, 60_000);

  it("blocks staff from submitting a manual POS tax override", async () => {
    await expect(createPosRestaurantOrder(staff(), {
      fulfillmentType: "TAKEAWAY",
      taxAmount: 75,
      items: [{ menuItemId, quantity: 1 }],
    })).rejects.toThrow("Manager approval is required for POS financial overrides");

    const count = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "source"='POS' AND "taxAmount"=75
    `;
    expect(count[0]?.count).toBe(0);
  });

  it("allows manager-created POS tax and discount overrides", async () => {
    const order = await createPosRestaurantOrder(manager(), {
      fulfillmentType: "TAKEAWAY",
      discountAmount: 50,
      taxAmount: 75,
      items: [{ menuItemId, quantity: 1 }],
    });

    const rows = await db.$queryRaw<Array<{ discountAmount: unknown; taxAmount: unknown; createdById: string | null }>>`
      SELECT "discountAmount", "taxAmount", "createdById"::text AS "createdById"
      FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(Number(rows[0]?.discountAmount)).toBe(50);
    expect(Number(rows[0]?.taxAmount)).toBe(75);
    expect(rows[0]?.createdById).toBe(managerId);
  });

  it("allows ordinary staff POS orders when no financial override is present", async () => {
    const order = await createPosRestaurantOrder(staff(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    expect(order.status).toBe("CONFIRMED");
  });

  it("rejects direct SQL insertion using a staff identity with a financial override", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status",
        "subtotal", "discountAmount", "taxAmount", "total", "createdById", "confirmedById", "confirmedAt"
      ) VALUES (
        ${workspaceId}::uuid, ${`R-DIRECT-${runId.slice(0, 8)}`}, 'POS', 'TAKEAWAY', 'CONFIRMED',
        500, 25, 0, 475, ${staffId}, ${staffId}, now()
      )
    `).rejects.toThrow("Manager approval is required for POS financial overrides");
  });
});
