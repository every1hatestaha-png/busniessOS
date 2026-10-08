import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRecipe: typeof import("@/lib/server/industry-modules")["createRecipe"];
let createKitchenTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateKitchenTicketStatus: typeof import("@/lib/server/industry-modules")["updateKitchenTicketStatus"];
let updateLegacyKitchenTicketStatusSafely: typeof import("@/lib/server/restaurant-legacy-kot")["updateLegacyKitchenTicketStatusSafely"];

const runId = randomUUID();
let userId = "";
let staffId = "";
let workspaceId = "";
let customerId = "";
let finishedProductId = "";
let ingredientProductId = "";
let salesOrderId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId: staffId });

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
    ({ createRecipe, createKitchenTicket, updateKitchenTicketStatus } = await import("@/lib/server/industry-modules"));
    ({ updateLegacyKitchenTicketStatusSafely } = await import("@/lib/server/restaurant-legacy-kot"));

    const user = await db.user.create({ data: { clerkId: `legacy-kot-${runId}`, email: `legacy-kot-${runId}@example.invalid` } });
    userId = user.id;
    const staffUser = await db.user.create({ data: { clerkId: `legacy-kot-staff-${runId}`, email: `legacy-kot-staff-${runId}@example.invalid` } });
    staffId = staffUser.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Legacy KOT ${runId}`, vertical: "LEGACY",
        members: { create: [{ userId, role: "OWNER" }, { userId: staffId, role: "STAFF", restaurantStation: "POS" }] },
      },
    });
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
    await db.user.deleteMany({ where: { id: { in: [userId, staffId] } } });
    await db.$disconnect();
  }, 60_000);

  it("denies direct POS-only legacy ticket creation and status changes before any write", async () => {
    const before = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    await expect(createKitchenTicket(staff(), { ticketNumber: `FORGED-${runId.slice(0, 8)}` }))
      .rejects.toThrow(/requires current KITCHEN station membership/i);
    const ticket = await createKitchenTicket(owner(), { ticketNumber: `GUARD-${runId.slice(0, 8)}`, salesOrderId });
    await expect(updateLegacyKitchenTicketStatusSafely(staff(), ticket.id, "PREPARING"))
      .rejects.toThrow(/requires current KITCHEN station membership/i);
    await expect(updateKitchenTicketStatus(staff(), ticket.id, "PREPARING"))
      .rejects.toThrow(/requires current KITCHEN station membership/i);
    const after = await db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id::text AS id, status FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    expect(after).toHaveLength(before[0]!.count + 1);
    expect(after.find(row => row.id === ticket.id)?.status).toBe("QUEUED");
  });

  it("accepts a current KITCHEN-only staff member but denies that actor after POS reassignment", async () => {
    await db.workspaceMember.updateMany({
      where: { workspaceId, userId: staffId }, data: { restaurantStation: "KITCHEN" },
    });
    try {
      const ticket = await createKitchenTicket(staff(), { ticketNumber: `KITCHEN-${runId.slice(0, 8)}` });
      await updateKitchenTicketStatus(staff(), ticket.id, "PREPARING");
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: "POS" },
      });
      await expect(updateKitchenTicketStatus(staff(), ticket.id, "READY"))
        .rejects.toThrow(/requires current KITCHEN station membership/i);
      const rows = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "kitchen_tickets" WHERE "id"=${ticket.id}::uuid
      `;
      expect(rows[0]?.status).toBe("PREPARING");
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: "POS" },
      });
    }
  });

  it("routes the historical exported updater through safe no-double-consumption logic", async () => {
    const ticket = await createKitchenTicket(owner(), { ticketNumber: `OLD-${runId.slice(0, 8)}`, salesOrderId });
    const before = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    await updateKitchenTicketStatus(owner(), ticket.id, "PREPARING");
    await updateKitchenTicketStatus(owner(), ticket.id, "READY");
    await updateKitchenTicketStatus(owner(), ticket.id, "SERVED");
    const after = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    const kitchenMovements = await db.inventoryTransaction.findMany({
      where: { workspaceId, reference: `KITCHEN:${ticket.id}` },
    });
    expect(Number(after.stockQuantity)).toBe(Number(before.stockQuantity));
    expect(kitchenMovements).toHaveLength(0);
    const audits = await db.auditLog.findMany({ where: { workspaceId, entityId: ticket.id, action: "restaurant.legacy_kot.status_changed" } });
    expect(audits).toHaveLength(3);
  });

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
