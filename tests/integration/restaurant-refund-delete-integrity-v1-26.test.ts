import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];
const runId = randomUUID();
const appRole = `restaurant_v126_${runId.replaceAll("-", "")}`;
let userId = "";
let workspaceA = "";
let workspaceB = "";
let cashA = "";
let secondManagerId = "";
let cashB = "";
const actor = (workspaceId = workspaceA) => ({ workspaceId, userId, role: "OWNER" as const });

describe("restaurant V1.26 refund delete integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));
    const user = await db.user.create({ data: { clerkId: `v126-${runId}`, email: `v126-${runId}@example.invalid` } });
    userId = user.id;
    secondManagerId = (await db.user.create({ data: { clerkId: `v126-manager-${runId}`, email: `v126-manager-${runId}@example.invalid` } })).id;
    const workspaces = await Promise.all(["A", "B"].map((suffix) => db.workspace.create({
      data: { name: `Refund snapshot ${suffix} ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    })));
    [workspaceA, workspaceB] = workspaces.map((w) => w.id);
    await db.workspaceMember.create({ data: { workspaceId: workspaceA, userId: secondManagerId, role: "MANAGER" } });
    for (const workspaceId of [workspaceA, workspaceB]) {
      await db.$executeRaw`
        INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
        VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
      `;
    }
    const cashIds: string[] = [];
    for (const [workspaceId, name] of [[workspaceA, "Original drawer"], [workspaceB, "Other tenant drawer"]]) {
      const created = await createCashBankAccount(actor(workspaceId), { name, openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
      const accounts = await getCashBankAccounts(workspaceId);
      cashIds.push(accounts.find((a) => a.id === created.id)!.cashBankAccountId);
    }
    [cashA, cashB] = cashIds;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(actor(workspaceA), 0, "V1.84 refund delete shift A");
    await openRestaurantCashShiftSafely(actor(workspaceB), 0, "V1.84 refund delete shift B");
    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT DELETE ON "restaurant_refunds" TO ${appRole}`);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of [workspaceA, workspaceB]) {
      await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
      await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
      await db.product.deleteMany({ where: { workspaceId } });
      await db.cashBankAccount.deleteMany({ where: { workspaceId } });
      await db.account.deleteMany({ where: { workspaceId } });
      await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.auditLog.deleteMany({ where: { workspaceId } });
    }
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, secondManagerId] } } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  }, 60_000);

  async function completedReceipt(workspaceId = workspaceA, cashId = cashA) {
    const { createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace");
    const { transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity");
    const product = await db.product.create({ data: { workspaceId, name: "Refund meal", sku: randomUUID(), stockQuantity: 20, costPrice: 100, sellingPrice: 500 } });
    const category = await createRestaurantMenuCategory(actor(workspaceId), { name: randomUUID() });
    const item = await createRestaurantMenuItem(actor(workspaceId), { categoryId: category.id, productId: product.id, name: "Refund meal", price: 500 });
    const pos = await createPosRestaurantOrder(actor(workspaceId), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: item.id, quantity: 1 }] });
    const payment = await recordRestaurantPaymentAtCollection(actor(workspaceId), { orderId: pos.id, cashBankAccountId: cashId, method: "CASH", amount: 200 });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
      await transitionRestaurantOrderWithIntegrity(actor(workspaceId), pos.id, status);
    }
    return { paymentId: payment.id, orderId: pos.id };
  }

  async function snapshot() {
    return {
      refunds: await db.$queryRaw`SELECT * FROM "restaurant_refunds" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid) ORDER BY "id"`,
      ledger: await db.generalLedgerEntry.findMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } }, orderBy: { id: "asc" } }),
      cash: await db.cashBankAccount.findMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } }, orderBy: { id: "asc" } }),
      payments: await db.$queryRaw`SELECT * FROM "restaurant_payments" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid) ORDER BY "id"`,
    };
  }

  it("retains refund, receipt, totals, cash and ledger after application DELETE and permits isolated DBA teardown", async () => {
    const original = await completedReceipt();
    const input = { paymentId: original.paymentId, reason: "Customer requested refund", idempotencyKey: `refund:${randomUUID()}` };
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashA } });
    const refund = await refundRestaurantPayment(actor(), input);
    expect(refund.idempotent).toBe(false);
    expect((await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashA } })).currentBalance.toString()).toBe(cashBefore.currentBalance.minus(200).toString());
    const before = await snapshot();
    const totals = () => db.$queryRaw`SELECT
      (SELECT SUM("amount") FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceA}::uuid)::text AS refunded,
      (SELECT SUM("amount") FROM "restaurant_payments" WHERE "workspaceId"=${workspaceA}::uuid)::text AS collected,
      "paymentStatus" FROM "restaurant_orders" WHERE "id"=${original.orderId}::uuid`;
    const beforeTotals = await totals();
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
      const roles = await tx.$queryRaw<Array<{ rolsuper: boolean }>>`SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user`;
      expect(roles).toEqual([{ rolsuper: false }]);
      return tx.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "id"=${refund.id}::uuid`;
    })).rejects.toThrow("Restaurant refund history cannot be deleted");
    expect(await snapshot()).toEqual(before);
    expect(await totals()).toEqual(beforeTotals);
    expect(await refundRestaurantPayment(actor(), input)).toMatchObject({ id: refund.id, idempotent: true });
    expect(await snapshot()).toEqual(before);
    expect(await totals()).toEqual(beforeTotals);
    // Explicitly prove the isolated privileged maintenance path without disabling triggers.
    const roles = await db.$queryRaw<Array<{ rolsuper: boolean }>>`SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user`;
    expect(roles).toEqual([{ rolsuper: true }]);
    expect(await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "id"=${refund.id}::uuid`).toBe(1);
  }, 60_000);
});
