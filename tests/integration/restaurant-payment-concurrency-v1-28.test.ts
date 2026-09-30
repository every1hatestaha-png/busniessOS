import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let cashId = "";
let workspaceId = "";
let ownerId = "";
let managerId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const manager = () => ({ workspaceId, userId: managerId, role: "MANAGER" as const });

async function order(total = 500) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "restaurant_orders" (
      "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "createdById",
      "subtotal", "total"
    ) VALUES (
      ${workspaceId}::uuid, ${randomUUID()}, 'MANUAL', 'TAKEAWAY', 'CONFIRMED', ${ownerId},
      ${total}, ${total}
    )
    RETURNING "id"::text AS "id"
  `;
  return rows[0]!.id;
}

async function state(orderId: string) {
  const [payments, orderRows, cash, ledger] = await Promise.all([
    db.$queryRaw<Array<{ id: string; amount: string; idempotencyKey: string | null; postedAt: Date | null }>>`
      SELECT "id"::text AS "id", "amount"::text AS "amount", "idempotencyKey", "postedAt"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid
        AND "restaurantOrderId"=${orderId}::uuid
        AND "voidedAt" IS NULL
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ paymentStatus: string; total: string }>>`
      SELECT "paymentStatus", "total"::text AS "total"
      FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${orderId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
  ]);
  return { payments, order: orderRows[0]!, cash, ledger };
}

function activePaid(snapshot: Awaited<ReturnType<typeof state>>) {
  return snapshot.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
}

describe("restaurant V1.28 live payment concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const runId = randomUUID();
    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v128-owner-${runId}`, email: `v128-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v128-manager-${runId}`, email: `v128-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Payment concurrency ${runId}`,
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

    const created = await createCashBankAccount(owner(), {
      name: "Live payment drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((account) => account.id === created.id)!.cashBankAccountId;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, managerId] } } });
    await db.$disconnect();
  }, 60_000);

  it("prevents concurrent collections from overpaying the outstanding balance", async () => {
    const orderId = await order(500);
    const before = await state(orderId);

    const settled = await Promise.allSettled([
      collect(owner(), {
        orderId,
        cashBankAccountId: cashId,
        method: "CASH",
        amount: 300,
        idempotencyKey: `pay:${randomUUID()}`,
      }),
      collect(manager(), {
        orderId,
        cashBankAccountId: cashId,
        method: "CASH",
        amount: 300,
        idempotencyKey: `pay:${randomUUID()}`,
      }),
    ]);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejection = settled.find((result) => result.status === "rejected");
    expect(String((rejection as PromiseRejectedResult).reason)).toContain("exceeds the net outstanding order balance");

    const after = await state(orderId);
    expect(after.payments).toHaveLength(1);
    expect(activePaid(after).toString()).toBe("300");
    expect(after.payments[0]!.postedAt).not.toBeNull();
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.plus(300).toString());
    expect(after.ledger.length - before.ledger.length).toBe(2);
    expect(after.order.paymentStatus).toBe("PARTIALLY_PAID");
  }, 60_000);

  it("accepts two concurrent exact split payments without losing either collection", async () => {
    const orderId = await order(500);
    const before = await state(orderId);

    const [first, second] = await Promise.all([
      collect(owner(), {
        orderId,
        cashBankAccountId: cashId,
        method: "CASH",
        amount: 250,
        idempotencyKey: `pay:${randomUUID()}`,
      }),
      collect(manager(), {
        orderId,
        cashBankAccountId: cashId,
        method: "CASH",
        amount: 250,
        idempotencyKey: `pay:${randomUUID()}`,
      }),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(false);

    const after = await state(orderId);
    expect(after.payments).toHaveLength(2);
    expect(activePaid(after).toString()).toBe("500");
    expect(after.payments.every((payment) => payment.postedAt !== null)).toBe(true);
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.plus(500).toString());
    expect(after.ledger.length - before.ledger.length).toBe(4);
    expect(after.order.paymentStatus).toBe("PAID");
  }, 60_000);

  it("deduplicates simultaneous duplicate taps using the same payment request ID", async () => {
    const orderId = await order(500);
    const before = await state(orderId);
    const idempotencyKey = `pay:${randomUUID()}`;
    const input = {
      orderId,
      cashBankAccountId: cashId,
      method: "CASH" as const,
      amount: 200,
      idempotencyKey,
    };

    const [first, second] = await Promise.all([
      collect(owner(), input),
      collect(manager(), input),
    ]);

    expect(first.id).toBe(second.id);
    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);

    const after = await state(orderId);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]!.idempotencyKey).toBe(idempotencyKey);
    expect(activePaid(after).toString()).toBe("200");
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.plus(200).toString());
    expect(after.ledger.length - before.ledger.length).toBe(2);
    expect(after.order.paymentStatus).toBe("PARTIALLY_PAID");

    expect(await collect(owner(), input)).toMatchObject({ id: first.id, idempotent: true });
    const retried = await state(orderId);
    expect(retried.payments).toEqual(after.payments);
    expect(retried.cash.currentBalance.toString()).toBe(after.cash.currentBalance.toString());
    expect(retried.ledger).toEqual(after.ledger);
  }, 60_000);
});
