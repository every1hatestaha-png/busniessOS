import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateLegacyTicket: typeof import("@/lib/server/restaurant-legacy-kot")["updateLegacyKitchenTicketStatusSafely"];

const runId = randomUUID();
let userId = "";
let workspaceA = "";
let workspaceB = "";
let customerA = "";
let customerB = "";
let salesOrderA = "";
let salesOrderB = "";
let tableA = "";
let localRestaurantOrderId = "";
const ownerA = () => ({ workspaceId: workspaceA, userId, role: "OWNER" as const });

async function snapshot(ticketId: string) {
  const rows = await db.$queryRaw<Array<{
    workspaceId: string;
    salesOrderId: string | null;
    restaurantOrderId: string | null;
    restaurantTableId: string | null;
    ticketNumber: string;
    createdAt: Date;
    status: string;
  }>>`
    SELECT "workspaceId"::text, "salesOrderId"::text, "restaurantOrderId"::text,
           "restaurantTableId"::text, "ticketNumber", "createdAt", "status"
    FROM "kitchen_tickets"
    WHERE "id"=${ticketId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.47 KDS identity integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantTable: createTable, createKitchenTicket: createTicket } = await import("@/lib/server/industry-modules"));
    ({ updateLegacyKitchenTicketStatusSafely: updateLegacyTicket } = await import("@/lib/server/restaurant-legacy-kot"));

    const user = await db.user.create({
      data: { clerkId: `v147-${runId}`, email: `v147-${runId}@example.invalid` },
    });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({
        data: { name: `KDS identity A ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
      }),
      db.workspace.create({
        data: { name: `KDS identity B ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
      }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES
        (${workspaceA}::uuid, 'restaurant', true, '{}'::jsonb, now()),
        (${workspaceB}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const [aCustomer, bCustomer] = await Promise.all([
      db.customer.create({ data: { workspaceId: workspaceA, name: "V1.47 A" } }),
      db.customer.create({ data: { workspaceId: workspaceB, name: "V1.47 B" } }),
    ]);
    customerA = aCustomer.id;
    customerB = bCustomer.id;

    const [aOrder, bOrder] = await Promise.all([
      db.salesOrder.create({
        data: {
          workspaceId: workspaceA,
          customerId: customerA,
          orderNumber: `SO-V147-A-${runId.slice(0, 8)}`,
          status: "CONFIRMED",
          subtotal: 0,
          discount: 0,
          total: 0,
          paidAmount: 0,
          balanceAmount: 0,
        },
      }),
      db.salesOrder.create({
        data: {
          workspaceId: workspaceB,
          customerId: customerB,
          orderNumber: `SO-V147-B-${runId.slice(0, 8)}`,
          status: "CONFIRMED",
          subtotal: 0,
          discount: 0,
          total: 0,
          paidAmount: 0,
          balanceAmount: 0,
        },
      }),
    ]);
    salesOrderA = aOrder.id;
    salesOrderB = bOrder.id;
    tableA = (await createTable(ownerA(), { name: `V147-A-${runId}`, capacity: 4 })).id;

    const restaurantRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES (
        ${workspaceA}::uuid, ${`R-V147-${runId}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID',
        0, 0, 0, 0
      ) RETURNING "id"::text
    `;
    localRestaurantOrderId = restaurantRows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.salesOrder.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.customer.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("freezes KOT tenant/document/table identity while preserving normal status progression", async () => {
    const ticket = await createTicket(ownerA(), {
      ticketNumber: `KOT-V147-${runId}`,
      salesOrderId: salesOrderA,
      restaurantTableId: tableA,
      notes: "identity regression",
    });
    const before = await snapshot(ticket.id);
    expect(before).toMatchObject({
      workspaceId: workspaceA,
      salesOrderId: salesOrderA,
      restaurantOrderId: null,
      restaurantTableId: tableA,
      status: "QUEUED",
    });

    const rewrites: Array<() => Promise<unknown>> = [
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "workspaceId"=${workspaceB}::uuid WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "salesOrderId"=${salesOrderB}::uuid WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "restaurantOrderId"=${localRestaurantOrderId}::uuid WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "restaurantTableId"=NULL WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "ticketNumber"=${`${before.ticketNumber}-FORGED`} WHERE "id"=${ticket.id}::uuid`,
      () => db.$executeRaw`UPDATE "kitchen_tickets" SET "createdAt"="createdAt" + interval '1 minute' WHERE "id"=${ticket.id}::uuid`,
    ];
    for (const rewrite of rewrites) {
      await expect(rewrite()).rejects.toThrow("Restaurant kitchen ticket identity snapshot is immutable");
      expect(await snapshot(ticket.id)).toEqual(before);
    }

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "workspaceId"="workspaceId", "salesOrderId"="salesOrderId", "restaurantOrderId"="restaurantOrderId",
          "restaurantTableId"="restaurantTableId", "ticketNumber"="ticketNumber", "createdAt"="createdAt"
      WHERE "id"=${ticket.id}::uuid
    `).resolves.toBe(1);

    await updateLegacyTicket(ownerA(), ticket.id, "PREPARING");
    const progressed = await snapshot(ticket.id);
    expect(progressed.status).toBe("PREPARING");
    expect({ ...progressed, status: before.status }).toEqual(before);
  }, 60_000);

  it("rejects cross-workspace sales-order parents and mixed legacy/native parents at INSERT", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" ("workspaceId", "salesOrderId", "ticketNumber")
      VALUES (${workspaceA}::uuid, ${salesOrderB}::uuid, ${`KOT-V147-FOREIGN-${runId}`})
    `).rejects.toThrow("Restaurant kitchen ticket sales order must belong to the same workspace");

    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" ("workspaceId", "salesOrderId", "restaurantOrderId", "ticketNumber")
      VALUES (
        ${workspaceA}::uuid, ${salesOrderA}::uuid, ${localRestaurantOrderId}::uuid,
        ${`KOT-V147-MIXED-${runId}`}
      )
    `).rejects.toThrow("Restaurant kitchen ticket cannot belong to both sales and restaurant orders");

    const counts = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid
        AND "ticketNumber" IN (${`KOT-V147-FOREIGN-${runId}`}, ${`KOT-V147-MIXED-${runId}`})
    `;
    expect(counts[0]?.count).toBe(0);
  }, 60_000);
});
