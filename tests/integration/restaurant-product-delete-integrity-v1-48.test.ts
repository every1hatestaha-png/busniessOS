import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceId = randomUUID();
const categoryId = randomUUID();
const menuProductId = randomUUID();
const finishedProductId = randomUUID();
const ingredientProductId = randomUUID();
const disposableProductId = randomUUID();
const menuItemId = randomUUID();
const recipeId = randomUUID();
const recipeItemId = randomUUID();

async function productExists(id: string) {
  return (await db.product.count({ where: { id, workspaceId } })) === 1;
}

describe("restaurant V1.48 product delete integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await db.workspace.create({
      data: { id: workspaceId, name: `Restaurant product delete ${runId}`, vertical: "LEGACY" },
    });

    await Promise.all([
      db.product.create({ data: { id: menuProductId, workspaceId, name: `V148-MENU-${runId}` } }),
      db.product.create({ data: { id: finishedProductId, workspaceId, name: `V148-FINISHED-${runId}` } }),
      db.product.create({ data: { id: ingredientProductId, workspaceId, name: `V148-INGREDIENT-${runId}` } }),
      db.product.create({ data: { id: disposableProductId, workspaceId, name: `V148-DISPOSABLE-${runId}` } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_categories" ("id", "workspaceId", "name")
      VALUES (${categoryId}::uuid, ${workspaceId}::uuid, ${`V148-CAT-${runId}`})
    `;

    await db.$executeRaw`
      INSERT INTO "restaurant_menu_items" (
        "id", "workspaceId", "categoryId", "productId", "name", "price"
      ) VALUES (
        ${menuItemId}::uuid, ${workspaceId}::uuid, ${categoryId}::uuid,
        ${menuProductId}, ${`V148-MENU-ITEM-${runId}`}, 1
      )
    `;

    await db.$executeRaw`
      INSERT INTO "recipes" (
        "id", "workspaceId", "finishedProductId", "yieldQuantity", "notes"
      ) VALUES (
        ${recipeId}::uuid, ${workspaceId}::uuid, ${finishedProductId}::uuid, 1,
        ${`V148 recipe ${runId}`}
      )
    `;

    await db.$executeRaw`
      INSERT INTO "recipe_items" (
        "id", "recipeId", "ingredientProductId", "quantity"
      ) VALUES (
        ${recipeItemId}::uuid, ${recipeId}::uuid, ${ingredientProductId}::uuid, 1
      )
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "id"=${menuItemId}::uuid`;
    await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId"=${recipeId}::uuid`;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id"=${recipeId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "id"=${categoryId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects deleting a Product linked by a Restaurant menu item", async () => {
    await expect(db.product.delete({ where: { id: menuProductId, workspaceId } }))
      .rejects.toThrow("Restaurant-linked product cannot be deleted while referenced by a menu item");
    expect(await productExists(menuProductId)).toBe(true);
  }, 60_000);

  it("rejects deleting a Product used as a Restaurant recipe finished product", async () => {
    await expect(db.product.delete({ where: { id: finishedProductId, workspaceId } }))
      .rejects.toThrow("Restaurant-linked product cannot be deleted while referenced by a recipe");
    expect(await productExists(finishedProductId)).toBe(true);
  }, 60_000);

  it("rejects deleting a Product used as a Restaurant recipe ingredient", async () => {
    await expect(db.product.delete({ where: { id: ingredientProductId, workspaceId } }))
      .rejects.toThrow("Restaurant-linked product cannot be deleted while referenced by a recipe ingredient");
    expect(await productExists(ingredientProductId)).toBe(true);
  }, 60_000);

  it("does not block physical deletion of a Product with no Restaurant references", async () => {
    await expect(db.product.delete({ where: { id: disposableProductId, workspaceId } })).resolves.toBeTruthy();
    expect(await productExists(disposableProductId)).toBe(false);
  }, 60_000);
});
