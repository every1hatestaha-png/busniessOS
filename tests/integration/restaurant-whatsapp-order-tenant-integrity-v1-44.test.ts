import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const orderA = randomUUID();
const orderB = randomUUID();
const messageA = randomUUID();

async function messageParent(messageId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; restaurantOrderId: string | null }>>`
    SELECT "workspaceId"::text, "restaurantOrderId"::text
    FROM "restaurant_whatsapp_messages"
    WHERE "id"=${messageId}::uuid
  `;
  return rows[0];
}

describe("restaurant V1.44 WhatsApp message order tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({
        data: { id: workspaceA, name: `WhatsApp parent A ${runId}`, vertical: "LEGACY" },
      }),
      db.workspace.create({
        data: { id: workspaceB, name: `WhatsApp parent B ${runId}`, vertical: "LEGACY" },
      }),
    ]);

    await db.$executeRaw`
      INSERT INTO "restaurant_orders" (
        "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES
        (${orderA}::uuid, ${workspaceA}::uuid, ${`V144-ORDER-A-${runId}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0),
        (${orderB}::uuid, ${workspaceB}::uuid, ${`V144-ORDER-B-${runId}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID', 0, 0, 0, 0)
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // Test-only teardown: production keeps WhatsApp intake evidence append-only.
    // Bypass user triggers only inside this isolated cleanup transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "externalMessageId" LIKE ${`V144-%-${runId}`}`;
    });
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "id" IN (${orderA}::uuid, ${orderB}::uuid)`;
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a WhatsApp message to reference an order from the same workspace", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_whatsapp_messages" (
        "id", "workspaceId", "externalMessageId", "customerPhone", "body", "restaurantOrderId"
      ) VALUES (
        ${messageA}::uuid, ${workspaceA}::uuid, ${`V144-A-${runId}`}, '+920000000001', 'test', ${orderA}::uuid
      )
    `).resolves.toBe(1);

    expect(await messageParent(messageA)).toEqual({
      workspaceId: workspaceA,
      restaurantOrderId: orderA,
    });
  }, 60_000);

  it("rejects a forged cross-workspace restaurantOrderId on INSERT", async () => {
    const forgedMessage = randomUUID();

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_whatsapp_messages" (
        "id", "workspaceId", "externalMessageId", "customerPhone", "body", "restaurantOrderId"
      ) VALUES (
        ${forgedMessage}::uuid, ${workspaceA}::uuid, ${`V144-FORGED-${runId}`}, '+920000000002', 'forged', ${orderB}::uuid
      )
    `).rejects.toThrow("WhatsApp message order must belong to the same workspace");

    expect(await messageParent(forgedMessage)).toBeUndefined();
  }, 60_000);

  it("rejects a forged cross-workspace restaurantOrderId on UPDATE and preserves the original order", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "restaurantOrderId"=${orderB}::uuid
      WHERE "id"=${messageA}::uuid
    `).rejects.toThrow("WhatsApp message order must belong to the same workspace");

    expect(await messageParent(messageA)).toEqual({
      workspaceId: workspaceA,
      restaurantOrderId: orderA,
    });
  }, 60_000);

  it("rejects moving a linked message to a different workspace while keeping the original order", async () => {
    await expect(db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "id"=${messageA}::uuid
    `).rejects.toThrow("WhatsApp message order must belong to the same workspace");

    expect(await messageParent(messageA)).toEqual({
      workspaceId: workspaceA,
      restaurantOrderId: orderA,
    });
  }, 60_000);
});
