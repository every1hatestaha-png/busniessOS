import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRecipe: typeof import("@/lib/server/industry-modules")["createRecipe"];
let createKitchenTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateLegacyKitchenTicketStatusSafely: typeof import("@/lib/server/restaurant-legacy-kot")["updateLegacyKitchenTicketStatusSafely"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let finishedProductId = "";
let ingredientProductId = "";
let salesOrderId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function cleanup() {
  await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId" IN (SELECT "id" FROM "recipes" WHERE "workspaceId"=${workspaceId}::uuid)`;
  await db.$executeRaw`DELETE FROM "recipes" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
  await db.salesOrderItem.deleteMany({ where: { salesOrderId } });
  await db.salesOrder.deleteMany({ where: { workspaceId } });
  await db.product.deleteMany({ where: { workspaceId } });
  await db.customer.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.auditLog.deleteMany({ where: { workspaceId } });
}

describe("restaurant V1.6 legacy KOT compatibility boundary", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRecipe, createKitchenTicket } = await import("@/lib/server/industry-modules"));
    ({ updateLegacyKitchenTicketStatusSafely } = await import("@/lib/server/restaurant-legacy-kot"));

    const user = await db.user.create({ data: { clerkId: `legacy-kot-${runId}`, email: `legacy-kot-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Legacy KOT ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const customer = await db.customer.create({ data: { workspaceId, name: "Legacy KOT Customer", phone: `0300${runId.replaceAll("-", "").slice(0, 7)}` } });
    customerId = customer.id;
    const [finished, ingredient] = await Promise.all([
      db.product.create({ data: { workspaceId, name: "Legacy Meal", sku: `MEAL-${runId}`, stockQuantity: 9, costPrice: 100, sellingPrice: 300 } }),
      db.product.create({ data: { workspaceId, name: "Legacy Ingredient", sku: `ING-${runId}`, stockQuantity: 20, costPrice: 50, sellingPrice: 0 } }),
    ]);
    finishedProductId = finished.id;
    ingredientProductId = ingredient.id;

    await createRecipe(owner(), {
      finishedProductId,
      yieldQuantity: 1,
      items: [{ ingredientProductId, quantity: 2, wastagePercent: 0 }],
    });

    const order = await db.salesOrder.create({
      data: {
        workspaceId,
        customerId,
        orderNumber: `SO-KOT-${runId.slice(0, 8)}`,
        status: "CONFIRMED",
        subtotal: 300,
        discount: 0,
        total: 300,
        paidAmount: 0,
        balanceAmount: 300,
        items: {
          create: {
            productId: finishedProductId,
            productName: "Legacy Meal",
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
          },
        },
      },
    });
    salesOrderId = order.id;
    // Simulate the inventory movement already posted by the normal sale engine.
    await db.inventoryTransaction.create({
      data: {
        workspaceId,
        productId: finishedProductId,
        type: "SALE",
        quantityChanged: -1,
        unitCost: 100,
        reference: order.orderNumber,
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup();
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("serves a legacy sales-linked ticket without consuming recipe inventory a second time", async () => {
    const ticket = await createKitchenTicket(owner(), {
      ticketNumber: `KT-${runId.slice(0, 8)}`,
      salesOrderId,
    });
    const before = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });

    await updateLegacyKitchenTicketStatusSafely(owner(), ticket.id, "PREPARING");
    await updateLegacyKitchenTicketStatusSafely(owner(), ticket.id, "READY");
    await updateLegacyKitchenTicketStatusSafely(owner(), ticket.id, "SERVED");

    const [after, kitchenMovements, audit, ticketRows] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: ingredientProductId } }),
      db.inventoryTransaction.findMany({ where: { workspaceId, reference: `KITCHEN:${ticket.id}` } }),
      db.auditLog.findMany({ where: { workspaceId, action: "restaurant.legacy_kot.status_changed", entityId: ticket.id } }),
      db.$queryRaw<Array<{ status: string; servedAt: Date | null }>>`SELECT "status", "servedAt" FROM "kitchen_tickets" WHERE "id"=${ticket.id}::uuid`,
    ]);

    expect(Number(after.stockQuantity)).toBe(Number(before.stockQuantity));
    expect(kitchenMovements).toHaveLength(0);
    expect(audit).toHaveLength(3);
    expect(ticketRows[0]?.status).toBe("SERVED");
    expect(ticketRows[0]?.servedAt).toBeTruthy();
  });
});
