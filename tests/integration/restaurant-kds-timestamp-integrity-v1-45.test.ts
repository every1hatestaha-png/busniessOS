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

async function state(ticketId: string) {
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

describe("restaurant V1.45 KDS timestamp integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantTable: createTable,
      createKitchenTicket: createTicket,
      updateKitchenTicketStatus: updateTicket,
    } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: `v145-${runId}`, email: `v145-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `KDS timestamps ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    tableId = (await createTable(owner(), { name: `V145-${runId}`, capacity: 4 })).id;
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

  it("requires coherent lifecycle timestamps and freezes each timestamp after it is recorded", async () => {
    const created = await createTicket(owner(), {
      ticketNumber: `KOT-V145-${runId}`,
      restaurantTableId: tableId,
    });
    const initial = await state(created.id);
    expect(initial).toMatchObject({ status: "QUEUED", startedAt: null, readyAt: null, servedAt: null });

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "startedAt"=now()
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket startedAt requires a started lifecycle state");
    expect(await state(created.id)).toEqual(initial);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='PREPARING'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket progressed state requires startedAt");
    expect(await state(created.id)).toEqual(initial);

    await updateTicket(owner(), created.id, "PREPARING");
    const preparing = await state(created.id);
    expect(preparing.status).toBe("PREPARING");
    expect(preparing.startedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "startedAt"="startedAt" + interval '1 second'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket startedAt is immutable once recorded");
    expect(await state(created.id)).toEqual(preparing);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='READY'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket ready state requires readyAt");
    expect(await state(created.id)).toEqual(preparing);

    await updateTicket(owner(), created.id, "READY");
    const ready = await state(created.id);
    expect(ready.status).toBe("READY");
    expect(ready.readyAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "readyAt"="readyAt" + interval '1 second'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket readyAt is immutable once recorded");
    expect(await state(created.id)).toEqual(ready);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='SERVED'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket SERVED state requires servedAt");
    expect(await state(created.id)).toEqual(ready);

    await updateTicket(owner(), created.id, "SERVED");
    const served = await state(created.id);
    expect(served.status).toBe("SERVED");
    expect(served.servedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "servedAt"="servedAt" + interval '1 second'
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket servedAt is immutable once recorded");
    expect(await state(created.id)).toEqual(served);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "startedAt"="startedAt", "readyAt"="readyAt", "servedAt"="servedAt"
      WHERE "id"=${created.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).resolves.toBe(1);
  }, 60_000);
});
