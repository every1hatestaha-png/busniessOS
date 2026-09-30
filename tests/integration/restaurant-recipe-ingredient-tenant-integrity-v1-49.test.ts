import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const finishedA = randomUUID();
const finishedB = randomUUID();
const ingredientA = randomUUID();
const ingredientB = randomUUID();
const recipeA = randomUUID();
const recipeB = randomUUID();
const recipeItemA = randomUUID();

async function itemParent(itemId: string) {
  const rows = await db.$queryRaw<Array<{ recipeId: string; ingredientProductId: string }>>`
    SELECT "recipeId"::text, "ingredientProductId"::text
    FROM "recipe_items"
    WHERE "id"=${itemId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.49 recipe ingredient tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Recipe ingredient A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Recipe ingredient B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await Promise.all([
      db.product.create({ data: { id: finishedA, workspaceId: workspaceA, name: `V149-FIN-A-${runId}` } }),
      db.product.create({ data: { id: finishedB, workspaceId: workspaceB, name: `V149-FIN-B-${runId}` } }),
      db.product.create({ data: { id: ingredientA, workspaceId: workspaceA, name: `V149-ING-A-${runId}` } }),
      db.product.create({ data: { id: ingredientB, workspaceId: workspaceB, name: `V149-ING-B-${runId}` } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES
        (${recipeA}::uuid, ${workspaceA}::uuid, ${finishedA}::uuid, 1),
        (${recipeB}::uuid, ${workspaceB}::uuid, ${finishedB}::uuid, 1)
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "recipe_items" WHERE "id"=${recipeItemA}::uuid`;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id" IN (${recipeA}::uuid, ${recipeB}::uuid)`;
    await db.product.deleteMany({ where: { id: { in: [finishedA, finishedB, ingredientA, ingredientB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a recipe item to reference an ingredient from the recipe workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "recipe_items" ("id", "recipeId", "ingredientProductId", "quantity")
      VALUES (${recipeItemA}::uuid, ${recipeA}::uuid, ${ingredientA}::uuid, 1)
    `).resolves.toBe(1);

    expect(await itemParent(recipeItemA)).toEqual({ recipeId: recipeA, ingredientProductId: ingredientA });
  }, 60_000);

  it("rejects a forged cross-workspace ingredientProductId on INSERT", async () => {
    const forgedItem = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "recipe_items" ("id", "recipeId", "ingredientProductId", "quantity")
      VALUES (${forgedItem}::uuid, ${recipeA}::uuid, ${ingredientB}::uuid, 1)
    `).rejects.toThrow("Restaurant recipe ingredient must belong to the same workspace as the recipe");

    expect(await itemParent(forgedItem)).toBeUndefined();
  }, 60_000);

  it("rejects a forged ingredientProductId UPDATE and preserves the original ingredient", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipe_items"
      SET "ingredientProductId"=${ingredientB}::uuid
      WHERE "id"=${recipeItemA}::uuid
    `).rejects.toThrow("Restaurant recipe ingredient must belong to the same workspace as the recipe");

    expect(await itemParent(recipeItemA)).toEqual({ recipeId: recipeA, ingredientProductId: ingredientA });
  }, 60_000);

  it("rejects moving a recipe item to a different-workspace recipe while retaining its ingredient", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipe_items"
      SET "recipeId"=${recipeB}::uuid
      WHERE "id"=${recipeItemA}::uuid
    `).rejects.toThrow("Restaurant recipe ingredient must belong to the same workspace as the recipe");

    expect(await itemParent(recipeItemA)).toEqual({ recipeId: recipeA, ingredientProductId: ingredientA });
  }, 60_000);
});
