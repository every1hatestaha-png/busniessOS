import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const recipeA = randomUUID();

async function recipeParent(recipeId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; finishedProductId: string }>>`
    SELECT "workspaceId"::text, "finishedProductId"::text
    FROM "recipes"
    WHERE "id"=${recipeId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.48 recipe finished product tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Recipe finished A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Recipe finished B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await Promise.all([
      db.product.create({ data: { id: productA, workspaceId: workspaceA, name: `V148-PROD-A-${runId}` } }),
      db.product.create({ data: { id: productB, workspaceId: workspaceB, name: `V148-PROD-B-${runId}` } }),
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id"=${recipeA}::uuid`;
    await db.product.deleteMany({ where: { id: { in: [productA, productB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a recipe to reference a finished product from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${recipeA}::uuid, ${workspaceA}::uuid, ${productA}::uuid, 1)
    `).resolves.toBe(1);

    expect(await recipeParent(recipeA)).toEqual({ workspaceId: workspaceA, finishedProductId: productA });
  }, 60_000);

  it("rejects a forged cross-workspace finishedProductId on INSERT", async () => {
    const forgedRecipe = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${forgedRecipe}::uuid, ${workspaceA}::uuid, ${productB}::uuid, 1)
    `).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");

    expect(await recipeParent(forgedRecipe)).toBeUndefined();
  }, 60_000);

  it("rejects a forged finishedProductId UPDATE and preserves the original product", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipes"
      SET "finishedProductId"=${productB}::uuid
      WHERE "id"=${recipeA}::uuid
    `).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");

    expect(await recipeParent(recipeA)).toEqual({ workspaceId: workspaceA, finishedProductId: productA });
  }, 60_000);

  it("rejects moving a recipe to another workspace while retaining its finished product", async () => {
    await expect(db.$executeRaw`
      UPDATE "recipes"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "id"=${recipeA}::uuid
    `).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");

    expect(await recipeParent(recipeA)).toEqual({ workspaceId: workspaceA, finishedProductId: productA });
  }, 60_000);
});
