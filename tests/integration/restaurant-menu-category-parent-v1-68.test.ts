import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const workspaceA = randomUUID();
const workspaceB = randomUUID();
const referencedCategoryId = randomUUID();
const freeCategoryId = randomUUID();
const menuItemId = randomUUID();

describe("restaurant V1.68 menu category parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    await db.workspace.createMany({ data: [
      { id: workspaceA, name: `V168 A ${workspaceA}`, vertical: "LEGACY" },
      { id: workspaceB, name: `V168 B ${workspaceB}`, vertical: "LEGACY" },
    ] });
    await db.$executeRaw`INSERT INTO "restaurant_menu_categories" (
      "id", "workspaceId", "name", "sortOrder", "isActive"
    ) VALUES
      (${referencedCategoryId}::uuid, ${workspaceA}::uuid, 'V168 Referenced', 1, true),
      (${freeCategoryId}::uuid, ${workspaceA}::uuid, 'V168 Free', 2, true)`;
    await db.$executeRaw`INSERT INTO "restaurant_menu_items" (
      "id", "workspaceId", "categoryId", "name", "price", "sortOrder", "isActive", "isAvailable"
    ) VALUES (
      ${menuItemId}::uuid, ${workspaceA}::uuid, ${referencedCategoryId}::uuid,
      'V168 Item', 100, 1, true, true
    )`;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("rejects moving a referenced category to another workspace", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_categories"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "id"=${referencedCategoryId}::uuid
    `).rejects.toThrow("Restaurant-linked menu category identity and workspace are immutable");

    const rows = await db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT "workspaceId"::text AS "workspaceId"
      FROM "restaurant_menu_categories"
      WHERE "id"=${referencedCategoryId}::uuid`;
    expect(rows[0]!.workspaceId).toBe(workspaceA);
  });

  it("rejects rewriting the identity of a referenced category", async () => {
    const replacement = randomUUID();
    await expect(db.$executeRaw`
      UPDATE "restaurant_menu_categories"
      SET "id"=${replacement}::uuid
      WHERE "id"=${referencedCategoryId}::uuid
    `).rejects.toThrow("Restaurant-linked menu category identity and workspace are immutable");

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "restaurant_menu_categories"
      WHERE "id"=${replacement}::uuid`;
    expect(rows).toEqual([{ count: 0 }]);
  });

  it("rejects deleting a referenced category with a domain-specific failure", async () => {
    await expect(db.$executeRaw`
      DELETE FROM "restaurant_menu_categories"
      WHERE "id"=${referencedCategoryId}::uuid
    `).rejects.toThrow("Restaurant-linked menu category cannot be deleted");
  });

  it("allows descriptive and availability edits", async () => {
    await db.$executeRaw`
      UPDATE "restaurant_menu_categories"
      SET "name"='V168 Renamed', "sortOrder"=9, "isActive"=false
      WHERE "id"=${referencedCategoryId}::uuid`;

    const rows = await db.$queryRaw<Array<{ name: string; sortOrder: number; isActive: boolean }>>`
      SELECT "name", "sortOrder", "isActive"
      FROM "restaurant_menu_categories"
      WHERE "id"=${referencedCategoryId}::uuid`;
    expect(rows).toEqual([{ name: "V168 Renamed", sortOrder: 9, isActive: false }]);
  });

  it("does not freeze an unreferenced category", async () => {
    await db.$executeRaw`
      UPDATE "restaurant_menu_categories"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "id"=${freeCategoryId}::uuid`;
    const moved = await db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT "workspaceId"::text AS "workspaceId"
      FROM "restaurant_menu_categories"
      WHERE "id"=${freeCategoryId}::uuid`;
    expect(moved[0]!.workspaceId).toBe(workspaceB);

    await db.$executeRaw`
      DELETE FROM "restaurant_menu_categories"
      WHERE "id"=${freeCategoryId}::uuid`;
  });
});
