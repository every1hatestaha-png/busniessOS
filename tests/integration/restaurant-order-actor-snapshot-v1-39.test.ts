import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let ingestWhatsapp: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-workspace")["transitionRestaurantOrder"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let menuItemId = "";
const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function actorSnapshot(orderId: string) {
  const rows = await db.$queryRaw<Array<{
    source: string;
    status: string;
    createdById: string | null;
    confirmedById: string | null;
    confirmedAt: Date | null;
  }>>`
    SELECT "source", "status", "createdById", "confirmedById", "confirmedAt"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.39 order actor snapshot", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createPosOrder,
      ingestWhatsappRestaurantOrder: ingestWhatsapp,
      confirmRestaurantOrder: confirmOrder,
      transitionRestaurantOrder: transition,
    } = await import("@/lib/server/restaurant-workspace"));

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v139-owner-${runId}`, email: `v139-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v139-manager-${runId}`, email: `v139-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Actor snapshot ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.workspaceMember.create({ data: { workspaceId, userId: managerId, role: "MANAGER" } });
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.39 meal",
        sku: `V139-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(owner(), { name: `V1.39 ${runId}` });
    const item = await createMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.39 meal",
      price: 200,
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
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, managerId] } } });
    await db.$disconnect();
  }, 60_000);

  it("freezes POS creator and confirmer attribution even against another valid workspace manager", async () => {
    const order = await createPosOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const before = await actorSnapshot(order.id);
    expect(before).toMatchObject({
      source: "POS",
      status: "CONFIRMED",
      createdById: ownerId,
      confirmedById: ownerId,
    });
    expect(before.confirmedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "createdById"=${managerId}
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order creator attribution is immutable");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "confirmedById"=${managerId}
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order confirmation attribution is immutable");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "confirmedAt"="confirmedAt" + interval '1 second'
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order confirmation attribution is immutable");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "createdById"="createdById", "confirmedById"="confirmedById", "confirmedAt"="confirmedAt"
      WHERE "id"=${order.id}::uuid
    `).resolves.toBe(1);
    expect(await actorSnapshot(order.id)).toEqual(before);

    await transition(owner(), order.id, "PREPARING");
    expect((await actorSnapshot(order.id)).status).toBe("PREPARING");
  }, 60_000);

  it("keeps WhatsApp intake actorless until one legitimate confirmation then freezes the confirmer", async () => {
    const messageId = `v139:${randomUUID()}`;
    const order = await ingestWhatsapp(workspaceId, {
      externalMessageId: messageId,
      messageBody: "One V1.39 meal please",
      customerPhone: "+923001234567",
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    const pending = await actorSnapshot(order.id);
    expect(pending).toMatchObject({
      source: "WHATSAPP",
      status: "PENDING_REVIEW",
      createdById: null,
      confirmedById: null,
      confirmedAt: null,
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "createdById"=${ownerId}
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order creator attribution is immutable");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "confirmedById"=${ownerId}, "confirmedAt"=now()
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order confirmation attribution is immutable");
    expect(await actorSnapshot(order.id)).toEqual(pending);

    await confirmOrder(owner(), order.id);
    const confirmed = await actorSnapshot(order.id);
    expect(confirmed).toMatchObject({
      source: "WHATSAPP",
      status: "CONFIRMED",
      createdById: null,
      confirmedById: ownerId,
    });
    expect(confirmed.confirmedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "confirmedById"=${managerId}
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order confirmation attribution is immutable");
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "confirmedAt"=NULL
      WHERE "id"=${order.id}::uuid
    `).rejects.toThrow("Restaurant order confirmation attribution is immutable");
    expect(await actorSnapshot(order.id)).toEqual(confirmed);

    await transition(owner(), order.id, "PREPARING");
    expect((await actorSnapshot(order.id)).status).toBe("PREPARING");
  }, 60_000);
});
