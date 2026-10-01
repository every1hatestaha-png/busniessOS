import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let voidPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
const runId = randomUUID();
const appRole = `restaurant_v124_${runId.replaceAll("-", "")}`;
let workspaceId = "";
let userId = "";
let cashId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function order() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "restaurant_orders" ("workspaceId", "orderNumber", "source", "fulfillmentType", "status", "createdById", "subtotal", "total")
    VALUES (${workspaceId}::uuid, ${randomUUID()}, 'MANUAL', 'TAKEAWAY', 'CONFIRMED', ${userId}, 500, 500)
    RETURNING "id"::text AS "id"
  `;
  return rows[0]!.id;
}

async function deleteAsApp(paymentId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    return tx.$executeRaw`DELETE FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid`;
  });
}

async function snapshot(paymentId: string, orderId: string) {
  return {
    payment: await db.$queryRaw`SELECT * FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid`,
    order: await db.$queryRaw`SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${orderId}::uuid`,
    ledger: await db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    cash: await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
  };
}

describe("restaurant V1.24 receipt history delete integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ voidRestaurantPayment: voidPayment } = await import("@/lib/server/restaurant-integrity"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
    const user = await db.user.create({ data: { clerkId: `v124-${runId}`, email: `v124-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Receipt retention ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    const cash = await createCashBankAccount(actor(), { name: "Retention drawer", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    cashId = (await getCashBankAccounts(workspaceId)).find((a) => a.id === cash.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(actor(), 0, "V1.84 payment delete shift");
    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT DELETE ON "restaurant_payments" TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT UPDATE ON "restaurant_orders" TO ${appRole}`);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // The isolated PostgreSQL superuser retains the established DBA maintenance
    // path. This also verifies teardown without disabling the new trigger.
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  }, 60_000);

  it("rejects deletion of a posted receipt without refund/return dependencies", async () => {
    const orderId = await order();
    const payment = await collect(actor(), { orderId, cashBankAccountId: cashId, method: "CASH", amount: 200 });
    const before = await snapshot(payment.id, orderId);
    await expect(deleteAsApp(payment.id)).rejects.toThrow("Restaurant payment history cannot be deleted");
    expect(await snapshot(payment.id, orderId)).toEqual(before);
  });

  it("retains unposted historical receipts with NULL creator identity", async () => {
    const orderId = await order();
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_payments" ("workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "cashShiftId")
      VALUES (${workspaceId}::uuid, ${orderId}::uuid, ${cashId}, 'CASH', 50,
        (SELECT "id" FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid AND "status"='OPEN' LIMIT 1))
      RETURNING "id"::text AS "id"
    `;
    const paymentId = rows[0]!.id;
    const before = await snapshot(paymentId, orderId);
    await expect(deleteAsApp(paymentId)).rejects.toThrow("Restaurant payment history cannot be deleted");
    expect(await snapshot(paymentId, orderId)).toEqual(before);
  });

  it("allows auditable void and retry, but retains the voided receipt", async () => {
    const orderId = await order();
    const payment = await collect(actor(), { orderId, cashBankAccountId: cashId, method: "CASH", amount: 200 });
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } });
    expect(await voidPayment(actor(), payment.id, "Correct mistaken collection")).toMatchObject({ id: payment.id, alreadyVoided: false });
    const before = await snapshot(payment.id, orderId);
    expect(before.cash.currentBalance.toString()).toBe(cashBefore.currentBalance.minus(200).toString());
    expect(before.order).toEqual([{ paymentStatus: "UNPAID" }]);
    expect(await voidPayment(actor(), payment.id, "Correct mistaken collection")).toMatchObject({ id: payment.id, alreadyVoided: true });
    expect(await snapshot(payment.id, orderId)).toEqual(before);
    await expect(deleteAsApp(payment.id)).rejects.toThrow("Restaurant payment history cannot be deleted");
    expect(await snapshot(payment.id, orderId)).toEqual(before);
  });
});
