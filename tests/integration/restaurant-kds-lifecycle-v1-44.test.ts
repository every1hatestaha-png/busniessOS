import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateTicket: typeof import("@/lib/server/industry-modules")["updateKitchenTicketStatus"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let tableId = "";
const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

async function ticketState(ticketId: string) {
  const rows = await db.$queryRaw<Array<{
    status: string;
    startedAt: Date | null;
    readyAt: Date | null;
    servedAt: Date | null;
  }>>`
    SELECT "status", "startedAt", "readyAt", "servedAt"
    FROM "kitchen_tickets"
    WHERE "id"=${ticketId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.44 KDS lifecycle", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantTable: createTable,
      createKitchenTicket: createTicket,
      updateKitchenTicketStatus: updateTicket,
    } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: `v144-${runId}`, email: `v144-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `KDS lifecycle ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    tableId = (await createTable(owner(), { name: `V144-${runId}`, capacity: 4 })).id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects illegal skips and terminal rewrites while preserving the real service lifecycle", async () => {
    const created = await createTicket(owner(), {
      ticketNumber: `KOT-V144-${runId}`,
      restaurantTableId: tableId,
      notes: "V1.44 lifecycle",
    });
    expect(await ticketState(created.id)).toMatchObject({
      status: "QUEUED",
      startedAt: null,
      readyAt: null,
      servedAt: null,
    });

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='READY'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant kitchen ticket status transition from QUEUED to READY");
    expect((await ticketState(created.id)).status).toBe("QUEUED");

    await updateTicket(owner(), created.id, "PREPARING");
    const preparing = await ticketState(created.id);
    expect(preparing.status).toBe("PREPARING");
    expect(preparing.startedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='SERVED'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant kitchen ticket status transition from PREPARING to SERVED");
    expect((await ticketState(created.id)).status).toBe("PREPARING");

    await updateTicket(owner(), created.id, "READY");
    const ready = await ticketState(created.id);
    expect(ready.status).toBe("READY");
    expect(ready.startedAt).not.toBeNull();
    expect(ready.readyAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"="status"
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).resolves.toBe(1);

    await updateTicket(owner(), created.id, "SERVED");
    const served = await ticketState(created.id);
    expect(served.status).toBe("SERVED");
    expect(served.servedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='PREPARING'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant kitchen ticket status transition from SERVED to PREPARING");
    expect((await ticketState(created.id)).status).toBe("SERVED");
  }, 60_000);

  it("preserves cancellation from active states and keeps cancellation terminal", async () => {
    const created = await createTicket(owner(), {
      ticketNumber: `KOT-V144-CANCEL-${runId}`,
      restaurantTableId: tableId,
    });
    await updateTicket(owner(), created.id, "CANCELLED");
    expect((await ticketState(created.id)).status).toBe("CANCELLED");

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='QUEUED'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant kitchen ticket status transition from CANCELLED to QUEUED");
    expect((await ticketState(created.id)).status).toBe("CANCELLED");
  }, 60_000);
});
