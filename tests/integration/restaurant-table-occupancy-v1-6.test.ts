import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createKitchenTicket: typeof import("@/lib/server/industry-modules")["createKitchenTicket"];
let updateLegacyKitchenTicketStatusSafely: typeof import("@/lib/server/restaurant-legacy-kot")["updateLegacyKitchenTicketStatusSafely"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("restaurant V1.6 cross-flow table occupancy", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantTable, createKitchenTicket } = await import("@/lib/server/industry-modules"));
    ({ updateLegacyKitchenTicketStatusSafely } = await import("@/lib/server/restaurant-legacy-kot"));
    const user = await db.user.create({ data: { clerkId: `table-guard-${runId}`, email: `table-guard-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Table Guard ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
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

  it("keeps a table occupied until its final legacy compatibility ticket is terminal", async () => {
    const table = await createRestaurantTable(owner(), { name: `T-${runId.slice(0, 6)}`, capacity: 4 });
    const ticket = await createKitchenTicket(owner(), { ticketNumber: `KT-TABLE-${runId.slice(0, 6)}`, restaurantTableId: table.id });

    await db.$executeRaw`
      UPDATE "restaurant_tables" SET "status"='AVAILABLE'
      WHERE "id"=${table.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    let rows = await db.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "restaurant_tables" WHERE "id"=${table.id}::uuid`;
    expect(rows[0]?.status).toBe("OCCUPIED");

    await updateLegacyKitchenTicketStatusSafely(owner(), ticket.id, "CANCELLED");
    rows = await db.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "restaurant_tables" WHERE "id"=${table.id}::uuid`;
    expect(rows[0]?.status).toBe("AVAILABLE");
  });
});
