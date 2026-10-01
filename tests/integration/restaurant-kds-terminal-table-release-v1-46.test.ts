import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateLegacyTicket: typeof import("@/lib/server/restaurant-legacy-kot")["updateLegacyKitchenTicketStatusSafely"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

async function tableStatus(tableId: string) {
  const rows = await db.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "restaurant_tables"
    WHERE "id"=${tableId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!.status;
}

describe("restaurant V1.46 terminal KOT table release", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantTable: createTable, createKitchenTicket: createTicket } = await import("@/lib/server/industry-modules"));
    ({ updateLegacyKitchenTicketStatusSafely: updateLegacyTicket } = await import("@/lib/server/restaurant-legacy-kot"));

    const user = await db.user.create({
      data: { clerkId: `v146-${runId}`, email: `v146-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `KDS terminal release ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
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

  it("releases a table after a direct terminal KOT transition", async () => {
    const table = await createTable(owner(), { name: `Direct-${runId}`, capacity: 4 });
    const ticket = await createTicket(owner(), {
      ticketNumber: `KOT-V146-DIRECT-${runId}`,
      restaurantTableId: table.id,
    });
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "status"='CANCELLED', "updatedAt"=now()
      WHERE "id"=${ticket.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).resolves.toBe(1);

    expect(await tableStatus(table.id)).toBe("AVAILABLE");
    const rows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "kitchen_tickets" WHERE "id"=${ticket.id}::uuid
    `;
    expect(rows[0]?.status).toBe("CANCELLED");
  }, 60_000);

  it("keeps the table occupied while another live KOT remains, then releases after the last terminal transition", async () => {
    const table = await createTable(owner(), { name: `Shared-${runId}`, capacity: 4 });
    const first = await createTicket(owner(), {
      ticketNumber: `KOT-V146-A-${runId}`,
      restaurantTableId: table.id,
    });
    const second = await createTicket(owner(), {
      ticketNumber: `KOT-V146-B-${runId}`,
      restaurantTableId: table.id,
    });
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='CANCELLED', "updatedAt"=now()
      WHERE "id"=${first.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await db.$executeRaw`
      UPDATE "kitchen_tickets" SET "status"='CANCELLED', "updatedAt"=now()
      WHERE "id"=${second.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);

  it("preserves the existing safe service release path", async () => {
    const table = await createTable(owner(), { name: `Service-${runId}`, capacity: 4 });
    const ticket = await createTicket(owner(), {
      ticketNumber: `KOT-V146-SERVICE-${runId}`,
      restaurantTableId: table.id,
    });
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await updateLegacyTicket(owner(), ticket.id, "CANCELLED");
    expect(await tableStatus(table.id)).toBe("AVAILABLE");

    const replay = await updateLegacyTicket(owner(), ticket.id, "CANCELLED");
    expect(replay.alreadyApplied).toBe(true);
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);
});
