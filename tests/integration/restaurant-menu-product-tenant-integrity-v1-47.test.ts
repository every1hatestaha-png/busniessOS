import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const categoryA = randomUUID();
const categoryB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const menuA = randomUUID();

async function menuLink(menuId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; categoryId: string; productId: string | null }>>`
    SELECT "workspaceId"::text, "categoryId"::text, "productId"
    FROM "restaurant_menu_items"
    WHERE "id"=${menuId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.47 menu product tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Menu product A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Menu product B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await Promise.all([
      db.product.create({ data: { id: productA, workspaceId: workspaceA, name: `V147-PROD-A-${runId}` } }),
      db.product.create({ data: { id: productB, workspaceId: workspaceB, name: `V147-PROD-B-${runId}` } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_categories" ("id", "workspaceId", "name")
      VALUES
        (${categoryA}::uuid, ${workspaceA}::uuid, ${`V147-CAT-A-${runId}`}),
        (${categoryB}::uuid, ${workspaceB}::uuid, ${`V147-CAT-B-${runId}`})
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "id"=${menuA}::uuid OR "name" LIKE ${`V147-%-${runId}`}`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "id" IN (${categoryA}::uuid, ${categoryB}::uuid)`;
    await db.product.deleteMany({ where: { id: { in: [productA, productB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a menu item to reference a product from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "productId", "name", "price"
      ) VALUES (
        ${menuA}::uuid, ${workspaceA}::uuid, ${categoryA}::uuid, ${productA}, ${`V147-A-${runId}`}, 1
      )
    `).resolves.toBe(1);

    expect(await menuLink(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA, productId: productA });
  }, 60_000);

  it("allows an intentionally unlinked menu item with NULL productId", async () => {
    const unlinkedMenu = randomUUID();
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "productId", "name", "price"
      ) VALUES (
        ${unlinkedMenu}::uuid, ${workspaceA}::uuid, ${categoryA}::uuid, NULL, ${`V147-UNLINKED-${runId}`}, 1
      )
    `).resolves.toBe(1);

    expect((await menuLink(unlinkedMenu))?.productId).toBeNull();
  }, 60_000);

  it("rejects a forged cross-workspace productId on INSERT", async () => {
    const forgedMenu = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "productId", "name", "price"
      ) VALUES (
        ${forgedMenu}::uuid, ${workspaceA}::uuid, ${categoryA}::uuid, ${productB}, ${`V147-FORGED-${runId}`}, 1
      )
    `).rejects.toThrow("Restaurant menu product must belong to the same workspace");

    expect(await menuLink(forgedMenu)).toBeUndefined();
  }, 60_000);

  it("rejects a forged productId UPDATE and preserves the original product", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "productId"=${productB}
      WHERE "id"=${menuA}::uuid
    `).rejects.toThrow("Restaurant menu product must belong to the same workspace");

    expect(await menuLink(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA, productId: productA });
  }, 60_000);

  it("rejects moving a linked menu item to another workspace even when its category is moved consistently", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "workspaceId"=${workspaceB}::uuid, "categoryId"=${categoryB}::uuid
      WHERE "id"=${menuA}::uuid
    `).rejects.toThrow("Restaurant menu product must belong to the same workspace");

    expect(await menuLink(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA, productId: productA });
  }, 60_000);
});
