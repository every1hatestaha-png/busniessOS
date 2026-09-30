import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const id = randomUUID();
  const [workspaceA, workspaceB] = await Promise.all([
    db.workspace.create({ data: { name: `V172 A ${id}`, vertical: "LEGACY" } }),
    db.workspace.create({ data: { name: `V172 B ${id}`, vertical: "LEGACY" } }),
  ]);
  const orderA = randomUUID();
  const orderB = randomUUID();
  await db.$executeRaw`
    INSERT INTO "restaurant_orders" (
      "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
      "subtotal", "discountAmount", "taxAmount", "total"
    ) VALUES
      (${orderA}::uuid, ${workspaceA.id}::uuid, ${`V172-A-${id}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'UNPAID', 50, 0, 0, 50),
      (${orderB}::uuid, ${workspaceA.id}::uuid, ${`V172-B-${id}`}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'UNPAID', 50, 0, 0, 50)
  `;
  const messageId = randomUUID();
  const externalMessageId = `wamid-v172-${id}`;
  const receivedAt = new Date("2026-09-30T12:00:00.000Z");
  const createdAt = new Date("2026-09-30T12:00:01.000Z");
  await db.$executeRaw`
    INSERT INTO "restaurant_whatsapp_messages" (
      "id", "workspaceId", "externalMessageId", "customerPhone", "customerName", "body",
      "restaurantOrderId", "receivedAt", "createdAt"
    ) VALUES (
      ${messageId}::uuid, ${workspaceA.id}::uuid, ${externalMessageId}, '+923001234567', 'V172 Customer',
      'one zinger burger', ${orderA}::uuid, ${receivedAt}, ${createdAt}
    )
  `;
  return {
    messageId,
    workspaceA: workspaceA.id,
    workspaceB: workspaceB.id,
    orderA,
    orderB,
    externalMessageId,
    receivedAt,
    createdAt,
  };
}

async function readMessage(f: Fixture) {
  const rows = await db.$queryRaw<Array<{
    id: string;
    workspaceId: string;
    externalMessageId: string;
    customerPhone: string;
    customerName: string | null;
    body: string;
    restaurantOrderId: string | null;
    receivedAt: Date;
    createdAt: Date;
  }>>`
    SELECT "id"::text AS "id", "workspaceId"::text AS "workspaceId", "externalMessageId",
           "customerPhone", "customerName", "body", "restaurantOrderId"::text AS "restaurantOrderId",
           "receivedAt", "createdAt"
    FROM "restaurant_whatsapp_messages"
    WHERE "id"=${f.messageId}::uuid
  `;
  return rows[0]!;
}

async function expectImmutable(f: Fixture, sql: Promise<unknown>) {
  await expect(sql).rejects.toThrow("Restaurant WhatsApp message evidence is immutable");
  expect(await readMessage(f)).toEqual({
    id: f.messageId,
    workspaceId: f.workspaceA,
    externalMessageId: f.externalMessageId,
    customerPhone: "+923001234567",
    customerName: "V172 Customer",
    body: "one zinger burger",
    restaurantOrderId: f.orderA,
    receivedAt: f.receivedAt,
    createdAt: f.createdAt,
  });
}

describe("restaurant V1.72 WhatsApp message snapshot", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("freezes provider identity, sender and raw message evidence", async () => {
    const f = await fixture();
    await expectImmutable(f, db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "externalMessageId"='forged-provider-id', "customerPhone"='+923009999999',
          "customerName"='Forged', "body"='forged body'
      WHERE "id"=${f.messageId}::uuid
    `);
  });

  it("freezes linked order association even to another valid same-tenant order", async () => {
    const f = await fixture();
    await expectImmutable(f, db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "restaurantOrderId"=${f.orderB}::uuid
      WHERE "id"=${f.messageId}::uuid
    `);
  });

  it("freezes message identity and chronology", async () => {
    const f = await fixture();
    await expectImmutable(f, db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "id"=${randomUUID()}::uuid,
          "receivedAt"='2026-09-30T13:00:00.000Z'::timestamptz,
          "createdAt"='2026-09-30T13:00:01.000Z'::timestamptz
      WHERE "id"=${f.messageId}::uuid
    `);
  });

  it("rejects moving message evidence across tenants without mutating persisted state", async () => {
    const f = await fixture();
    await expect(db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "workspaceId"=${f.workspaceB}::uuid
      WHERE "id"=${f.messageId}::uuid
    `).rejects.toThrow();
    expect((await readMessage(f)).workspaceId).toBe(f.workspaceA);
  });

  it("rejects destructive deletion", async () => {
    const f = await fixture();
    await expect(db.$executeRaw`
      DELETE FROM "restaurant_whatsapp_messages"
      WHERE "id"=${f.messageId}::uuid
    `).rejects.toThrow("Restaurant WhatsApp message history cannot be deleted");
    expect(await readMessage(f)).toBeTruthy();
  });

  it("allows harmless no-op maintenance", async () => {
    const f = await fixture();
    await expect(db.$executeRaw`
      UPDATE "restaurant_whatsapp_messages"
      SET "body"="body"
      WHERE "id"=${f.messageId}::uuid
    `).resolves.toBe(1);
    expect((await readMessage(f)).body).toBe("one zinger burger");
  });
});
