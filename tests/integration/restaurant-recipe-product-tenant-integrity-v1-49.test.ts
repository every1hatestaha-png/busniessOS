import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const finishedA = randomUUID();
const ingredientA = randomUUID();
const finishedB = randomUUID();
const ingredientB = randomUUID();
const recipeA = randomUUID();
const recipeItemA = randomUUID();

async function recipeRow(id: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; finishedProductId: string }>>`
    SELECT "workspaceId"::text, "finishedProductId"::text
    FROM "recipes"
    WHERE "id"=${id}::uuid
  `;
  return rows[0];
}

async function recipeItemProduct(id: string) {
  const rows = await db.$queryRaw<Array<{ ingredientProductId: string }>>`
    SELECT "ingredientProductId"::text
    FROM "recipe_items"
    WHERE "id"=${id}::uuid
  `;
  return rows[0]?.ingredientProductId;
}

describe("restaurant V1.49 recipe product tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Recipe tenant A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Recipe tenant B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await Promise.all([
      db.product.create({ data: { id: finishedA, workspaceId: workspaceA, name: `V149-FIN-A-${runId}` } }),
      db.product.create({ data: { id: ingredientA, workspaceId: workspaceA, name: `V149-ING-A-${runId}` } }),
      db.product.create({ data: { id: finishedB, workspaceId: workspaceB, name: `V149-FIN-B-${runId}` } }),
      db.product.create({ data: { id: ingredientB, workspaceId: workspaceB, name: `V149-ING-B-${runId}` } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${recipeA}::uuid, ${workspaceA}::uuid, ${finishedA}::uuid, 1)
    `;

    await db.$executeRaw`
      INSERT INTO "recipe_items" ("id", "recipeId", "ingredientProductId", "quantity")
      VALUES (${recipeItemA}::uuid, ${recipeA}::uuid, ${ingredientA}::uuid, 1)
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId"=${recipeA}::uuid OR "id"=${recipeItemA}::uuid`;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id"=${recipeA}::uuid OR "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.product.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("accepts a recipe whose finished product and ingredient belong to its workspace", async () => {
    expect(await recipeRow(recipeA)).toEqual({ workspaceId: workspaceA, finishedProductId: finishedA });
    expect(await recipeItemProduct(recipeItemA)).toBe(ingredientA);
  });

  it("rejects a forged cross-workspace finished product on INSERT", async () => {
    const forgedRecipe = randomUUID();
    await expect(db.$executeRaw`
      INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${forgedRecipe}::uuid, ${workspaceA}::uuid, ${finishedB}::uuid, 1)
    `).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");
    expect(await recipeRow(forgedRecipe)).toBeUndefined();
  });

  it("rejects a forged cross-workspace ingredient on INSERT", async () => {
    const forgedItem = randomUUID();
    await expect(db.$executeRaw`
      INSERT INTO "recipe_items" ("id", "recipeId", "ingredientProductId", "quantity")
      VALUES (${forgedItem}::uuid, ${recipeA}::uuid, ${ingredientB}::uuid, 1)
    `).rejects.toThrow("Restaurant recipe ingredient product must belong to the same workspace");
    expect(await recipeItemProduct(forgedItem)).toBeUndefined();
  });

  it("rejects a forged ingredient UPDATE and preserves the original product", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipe_items"
      SET "ingredientProductId"=${ingredientB}::uuid
      WHERE "id"=${recipeItemA}::uuid
    `).rejects.toThrow("Restaurant recipe ingredient product must belong to the same workspace");
    expect(await recipeItemProduct(recipeItemA)).toBe(ingredientA);
  });

  it("rejects moving a populated recipe across workspaces even with a valid new finished product", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipes"
      SET "workspaceId"=${workspaceB}::uuid, "finishedProductId"=${finishedB}::uuid
      WHERE "id"=${recipeA}::uuid
    `).rejects.toThrow("Restaurant recipe ingredients must belong to the same workspace");
    expect(await recipeRow(recipeA)).toEqual({ workspaceId: workspaceA, finishedProductId: finishedA });
    expect(await recipeItemProduct(recipeItemA)).toBe(ingredientA);
  });
});
