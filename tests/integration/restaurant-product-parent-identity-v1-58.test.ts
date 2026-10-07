import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const finished = randomUUID();
const ingredient = randomUUID();
const recipe = randomUUID();

describe("restaurant V1.58 referenced Product parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    await db.workspace.createMany({ data: [
      { id: workspaceA, name: `V158 A ${workspaceA}`, vertical: "LEGACY" },
      { id: workspaceB, name: `V158 B ${workspaceB}`, vertical: "LEGACY" },
    ] });
    await db.product.createMany({ data: [
      { id: finished, workspaceId: workspaceA, name: "V158 meal" },
      { id: ingredient, workspaceId: workspaceA, name: "V158 ingredient" },
    ] });
    await db.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${recipe}::uuid, ${workspaceA}::uuid, ${finished}::uuid, 1)`;
    await db.$executeRaw`INSERT INTO "recipe_items" ("recipeId", "ingredientProductId", "quantity")
      VALUES (${recipe}::uuid, ${ingredient}::uuid, 0.25)`;
  });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it.each([finished, ingredient])("rejects moving referenced Product %s to another workspace", async id => {
    await expect(db.product.update({ where: { id }, data: { workspaceId: workspaceB } }))
      .rejects.toThrow("Restaurant-linked product identity and workspace are immutable");
    expect((await db.product.findUniqueOrThrow({ where: { id } })).workspaceId).toBe(workspaceA);
  });

  it.each([finished, ingredient])("rejects rewriting referenced Product %s identity", async id => {
    const replacement = randomUUID();
    await expect(db.product.update({ where: { id }, data: { id: replacement } }))
      .rejects.toThrow("Restaurant-linked product identity and workspace are immutable");
    expect(await db.product.findUnique({ where: { id: replacement } })).toBeNull();
    expect((await db.product.findUniqueOrThrow({ where: { id } })).workspaceId).toBe(workspaceA);
  });

  it("preserves normal same-workspace edits and recipe references", async () => {
    const updated = await db.product.update({ where: { id: ingredient }, data: { name: "Renamed ingredient", costPrice: 12.5 } });
    expect(updated.name).toBe("Renamed ingredient");
    expect(updated.costPrice.toFixed(2)).toBe("12.50");
    const rows = await db.$queryRaw<Array<{ finishedProductId: string; ingredientProductId: string }>>`
      SELECT r."finishedProductId"::text, ri."ingredientProductId"::text FROM "recipes" r
      JOIN "recipe_items" ri ON ri."recipeId"=r."id" WHERE r."id"=${recipe}::uuid`;
    expect(rows).toEqual([{ finishedProductId: finished, ingredientProductId: ingredient }]);
  });
});
