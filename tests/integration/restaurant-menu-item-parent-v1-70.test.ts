import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const id = randomUUID();
  const user = await db.user.create({
    data: { clerkId: `v170-${id}`, email: `v170-${id}@example.invalid` },
  });
  const workspace = await db.workspace.create({
    data: {
      name: `V170 ${id}`,
      vertical: "LEGACY",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const otherWorkspace = await db.workspace.create({
    data: { name: `V170 other ${id}`, vertical: "LEGACY" },
  });
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspace.id}::uuid, 'restaurant', true, '{}'::jsonb, now())
  `;

  const context = { workspaceId: workspace.id, role: "OWNER" as const, userId: user.id };
  const [productA, productB] = await Promise.all([
    db.product.create({
      data: { workspaceId: workspace.id, name: `V170 Product A ${id}`, stockQuantity: 10, costPrice: 10, sellingPrice: 100 },
    }),
    db.product.create({
      data: { workspaceId: workspace.id, name: `V170 Product B ${id}`, stockQuantity: 10, costPrice: 20, sellingPrice: 120 },
    }),
  ]);
  const categoryA = await createRestaurantMenuCategory(context, { name: `V170 Category A ${id}` });
  const categoryB = await createRestaurantMenuCategory(context, { name: `V170 Category B ${id}` });
  const menuItem = await createRestaurantMenuItem(context, {
    categoryId: categoryA.id,
    productId: productA.id,
    name: `V170 Menu ${id}`,
    price: 100,
  });
  await createPosRestaurantOrder(context, {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
  });

  return {
    workspaceId: workspace.id,
    otherWorkspaceId: otherWorkspace.id,
    menuItemId: menuItem.id,
    productAId: productA.id,
    productBId: productB.id,
    categoryAId: categoryA.id,
    categoryBId: categoryB.id,
  };
}

async function expectIdentityFailure(f: Fixture, sql: Promise<unknown>) {
  await expect(sql).rejects.toThrow("Restaurant-linked menu item identity, tenant, category and product mapping are immutable");
  const rows = await db.$queryRaw<Array<{ workspaceId: string; categoryId: string; productId: string | null }>>`
    SELECT "workspaceId"::text AS "workspaceId", "categoryId"::text AS "categoryId", "productId"
    FROM "restaurant_menu_items"
    WHERE "id"=${f.menuItemId}::uuid`;
  expect(rows).toEqual([{ workspaceId: f.workspaceId, categoryId: f.categoryAId, productId: f.productAId }]);
}

describe("restaurant V1.70 menu item parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("rejects moving a referenced menu item to another workspace", async () => {
    const f = await fixture();
    await expectIdentityFailure(f, db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "workspaceId"=${f.otherWorkspaceId}::uuid
      WHERE "id"=${f.menuItemId}::uuid
    `);
  });

  it("rejects rewriting a referenced menu item identity", async () => {
    const f = await fixture();
    const replacement = randomUUID();
    await expectIdentityFailure(f, db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "id"=${replacement}::uuid
      WHERE "id"=${f.menuItemId}::uuid
    `);
  });

  it("rejects changing the category of a referenced menu item", async () => {
    const f = await fixture();
    await expectIdentityFailure(f, db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "categoryId"=${f.categoryBId}::uuid
      WHERE "id"=${f.menuItemId}::uuid
    `);
  });

  it("rejects changing the product mapping of a referenced menu item", async () => {
    const f = await fixture();
    await expectIdentityFailure(f, db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "productId"=${f.productBId}
      WHERE "id"=${f.menuItemId}::uuid
    `);
  });

  it("rejects deleting a referenced menu item instead of nulling historical order links", async () => {
    const f = await fixture();
    await expect(db.$executeRaw`
      DELETE FROM "restaurant_menu_items"
      WHERE "id"=${f.menuItemId}::uuid
    `).rejects.toThrow("Restaurant-linked menu item cannot be deleted");
  });

  it("allows current-menu presentation edits without rewriting order identity", async () => {
    const f = await fixture();
    await db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "name"='V170 Renamed', "description"='Updated description', "price"=155,
          "sortOrder"=7, "isActive"=false, "isAvailable"=false
      WHERE "id"=${f.menuItemId}::uuid`;
    const rows = await db.$queryRaw<Array<{ name: string; price: string; isActive: boolean; isAvailable: boolean }>>`
      SELECT "name", "price"::text AS "price", "isActive", "isAvailable"
      FROM "restaurant_menu_items"
      WHERE "id"=${f.menuItemId}::uuid`;
    expect(rows).toEqual([{ name: "V170 Renamed", price: "155.00", isActive: false, isAvailable: false }]);
  });
});
