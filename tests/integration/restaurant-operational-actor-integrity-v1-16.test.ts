import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let ingestWhatsappRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];

const runId = randomUUID();
let ownerId = "";
let staffId = "";
let foreignId = "";
let workspaceId = "";
let foreignWorkspaceId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId: ownerId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId: staffId });
const forgedStaff = () => ({ workspaceId, role: "STAFF" as const, userId: foreignId });

async function enableRestaurant(id: string) {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${id}::uuid, 'restaurant', true, '{}'::jsonb, now())
  `;
}

describe("restaurant V1.16 operational actor membership", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory,
      createRestaurantMenuItem,
      createPosRestaurantOrder,
      ingestWhatsappRestaurantOrder,
      confirmRestaurantOrder,
    } = await import("@/lib/server/restaurant-workspace"));

    const [ownerUser, staffUser, foreignUser] = await Promise.all([
      db.user.create({ data: { clerkId: `op-owner-${runId}`, email: `op-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `op-staff-${runId}`, email: `op-staff-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `op-foreign-${runId}`, email: `op-foreign-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    staffId = staffUser.id;
    foreignId = foreignUser.id;

    const [workspace, foreignWorkspace] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Operational Actor A ${runId}`,
          vertical: "LEGACY",
          members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
        },
      }),
      db.workspace.create({
        data: {
          name: `Operational Actor B ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId: foreignId, role: "STAFF" } },
        },
      }),
    ]);
    workspaceId = workspace.id;
    foreignWorkspaceId = foreignWorkspace.id;
    await enableRestaurant(workspaceId);

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "Operational Meal",
        sku: `OP-${runId}`,
        stockQuantity: 20,
        costPrice: 100,
        sellingPrice: 500,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: "Operational Menu" });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Operational Meal",
      price: 500,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // Test-only teardown: production keeps WhatsApp intake evidence append-only.
    // Bypass user triggers only inside this isolated cleanup transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
    });
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, staffId, foreignId] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a real staff member to create a normal POS order", async () => {
    const order = await createPosRestaurantOrder(staff(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const rows = await db.$queryRaw<Array<{ createdById: string | null; status: string }>>`
      SELECT "createdById", "status" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ createdById: staffId, status: "CONFIRMED" });
  });

  it("rejects a forged POS actor that is not a member of the workspace", async () => {
    await expect(createPosRestaurantOrder(forgedStaff(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    })).rejects.toThrow("requires current POS station membership in the same workspace");
  });


  it("denies KITCHEN-only staff direct POS creation without changing orders or tickets", async () => {
    const beforeOrders = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    const beforeTickets = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    const current = await db.workspaceMember.findFirstOrThrow({
      where: { workspaceId, userId: staffId }, select: { restaurantStation: true },
    });
    try {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: "KITCHEN" },
      });
      await expect(createPosRestaurantOrder(staff(), {
        idempotencyKey: randomUUID(), fulfillmentType: "TAKEAWAY",
        items: [{ menuItemId, quantity: 1 }],
      })).rejects.toThrow("requires current POS station membership in the same workspace");
      const afterOrders = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid
      `;
      const afterTickets = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid
      `;
      expect(afterOrders).toEqual(beforeOrders);
      expect(afterTickets).toEqual(beforeTickets);
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: current.restaurantStation },
      });
    }
  });

  it("rejects a formerly valid POS idempotency replay immediately after station reassignment", async () => {
    const key = randomUUID();
    const request = {
      idempotencyKey: key, fulfillmentType: "TAKEAWAY" as const,
      items: [{ menuItemId, quantity: 1 }],
    };
    const order = await createPosRestaurantOrder(staff(), request);
    const current = await db.workspaceMember.findFirstOrThrow({
      where: { workspaceId, userId: staffId }, select: { restaurantStation: true },
    });
    const before = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "externalReference"=${`pos:${key}`}
    `;
    expect(before[0]?.count).toBe(1);
    try {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: "KITCHEN" },
      });
      await expect(createPosRestaurantOrder(staff(), request))
        .rejects.toThrow("requires current POS station membership in the same workspace");
      const after = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM "restaurant_orders"
        WHERE "workspaceId"=${workspaceId}::uuid AND "externalReference"=${`pos:${key}`}
      `;
      expect(after).toEqual(before);
      expect(order.status).toBe("CONFIRMED");
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: current.restaurantStation },
      });
    }
  });

  it("denies Kitchen-only staff WhatsApp confirmation and leaves the pending order unmodified", async () => {
    const order = await ingestWhatsappRestaurantOrder(workspaceId, {
      externalMessageId: `op-wa-kitchen-${runId}`,
      messageBody: "One Operational Meal pending review",
      customerPhone: "+923001234567",
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const current = await db.workspaceMember.findFirstOrThrow({
      where: { workspaceId, userId: staffId }, select: { restaurantStation: true },
    });
    try {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: "KITCHEN" },
      });
      await expect(confirmRestaurantOrder(staff(), order.id))
        .rejects.toThrow("requires current POS station membership in the same workspace");
      const rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
        SELECT "status", "confirmedById" FROM "restaurant_orders"
        WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
      `;
      const tickets = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM "kitchen_tickets"
        WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
      `;
      expect(rows[0]).toMatchObject({ status: "PENDING_REVIEW", confirmedById: null });
      expect(tickets[0]?.count).toBe(0);
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffId }, data: { restaurantStation: current.restaurantStation },
      });
    }
  });

  it("requires a real workspace member when confirming a pending WhatsApp order", async () => {
    const order = await ingestWhatsappRestaurantOrder(workspaceId, {
      externalMessageId: `op-wa-${runId}`,
      messageBody: "One Operational Meal",
      customerPhone: "+923001234567",
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(confirmRestaurantOrder(forgedStaff(), order.id))
      .rejects.toThrow("requires current POS station membership in the same workspace");

    let rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
      SELECT "status", "confirmedById" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "PENDING_REVIEW", confirmedById: null });

    await confirmRestaurantOrder(staff(), order.id);
    rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
      SELECT "status", "confirmedById" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "CONFIRMED", confirmedById: staffId });
  });
});