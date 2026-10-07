import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const tableA = randomUUID();
const tableB = randomUUID();
const ticketA = randomUUID();
const ticketNumberA = `V143-A-${runId}`;

async function ticketTable(ticketId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; restaurantTableId: string | null }>>`
    SELECT "workspaceId"::text, "restaurantTableId"::text
    FROM "kitchen_tickets"
    WHERE "id"=${ticketId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.43 kitchen ticket table tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await db.$executeRaw`
      INSERT INTO "restaurant_tables" ("id", "workspaceId", "name", "capacity", "status")
      VALUES
        (${tableA}::uuid, ${workspaceA}::uuid, ${`V143-A-${runId}`}, 4, 'AVAILABLE'),
        (${tableB}::uuid, ${workspaceB}::uuid, ${`V143-B-${runId}`}, 4, 'AVAILABLE')
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "ticketNumber" LIKE ${`V143-%-${runId}`}`;
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "id" IN (${tableA}::uuid, ${tableB}::uuid)`;
    await db.$disconnect();
  }, 60_000);

  it("allows a kitchen ticket to reference a table from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "id", "workspaceId", "restaurantTableId", "ticketNumber", "status"
      ) VALUES (
        ${ticketA}::uuid, ${workspaceA}::uuid, ${tableA}::uuid, ${ticketNumberA}, 'QUEUED'
      )
    `).resolves.toBe(1);

    expect(await ticketTable(ticketA)).toEqual({
      workspaceId: workspaceA,
      restaurantTableId: tableA,
    });
  }, 60_000);

  it("rejects a forged cross-workspace restaurantTableId on INSERT", async () => {
    const forgedTicket = randomUUID();
    const forgedNumber = `V143-FORGED-${runId}`;

    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "id", "workspaceId", "restaurantTableId", "ticketNumber", "status"
      ) VALUES (
        ${forgedTicket}::uuid, ${workspaceA}::uuid, ${tableB}::uuid, ${forgedNumber}, 'QUEUED'
      )
    `).rejects.toThrow("Kitchen ticket table must belong to the same workspace");

    expect(await ticketTable(forgedTicket)).toBeUndefined();
  }, 60_000);

  it("rejects a forged cross-workspace restaurantTableId on UPDATE and preserves the original table", async () => {
    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "restaurantTableId"=${tableB}::uuid
      WHERE "id"=${ticketA}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket identity snapshot is immutable");

    expect(await ticketTable(ticketA)).toEqual({
      workspaceId: workspaceA,
      restaurantTableId: tableA,
    });
  }, 60_000);
});
