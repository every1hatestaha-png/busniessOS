import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const categoryA = randomUUID();
const categoryB = randomUUID();
const menuA = randomUUID();

async function menuParent(menuId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; categoryId: string }>>`
    SELECT "workspaceId"::text, "categoryId"::text
    FROM "restaurant_menu_items"
    WHERE "id"=${menuId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.46 menu category tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Menu category A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Menu category B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_categories" ("id", "workspaceId", "name")
      VALUES
        (${categoryA}::uuid, ${workspaceA}::uuid, ${`V146-CAT-A-${runId}`}),
        (${categoryB}::uuid, ${workspaceB}::uuid, ${`V146-CAT-B-${runId}`})
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "id"=${menuA}::uuid OR "name" LIKE ${`V146-%-${runId}`}`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "id" IN (${categoryA}::uuid, ${categoryB}::uuid)`;
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a menu item to reference a category from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "name", "price"
      ) VALUES (
        ${menuA}::uuid, ${workspaceA}::uuid, ${categoryA}::uuid, ${`V146-A-${runId}`}, 1
      )
    `).resolves.toBe(1);

    expect(await menuParent(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA });
  }, 60_000);

  it("rejects a forged cross-workspace categoryId on INSERT", async () => {
    const forgedMenu = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "name", "price"
      ) VALUES (
        ${forgedMenu}::uuid, ${workspaceA}::uuid, ${categoryB}::uuid, ${`V146-FORGED-${runId}`}, 1
      )
    `).rejects.toThrow("Restaurant menu category must belong to the same workspace");

    expect(await menuParent(forgedMenu)).toBeUndefined();
  }, 60_000);

  it("rejects a forged categoryId UPDATE and preserves the original category", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "categoryId"=${categoryB}::uuid
      WHERE "id"=${menuA}::uuid
    `).rejects.toThrow("Restaurant menu category must belong to the same workspace");

    expect(await menuParent(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA });
  }, 60_000);

  it("rejects moving a linked menu item to another workspace while keeping its category", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "id"=${menuA}::uuid
    `).rejects.toThrow("Restaurant menu category must belong to the same workspace");

    expect(await menuParent(menuA)).toEqual({ workspaceId: workspaceA, categoryId: categoryA });
  }, 60_000);
});
