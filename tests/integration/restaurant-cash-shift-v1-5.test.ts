import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let openCashShift: typeof import("@/lib/server/industry-modules")["openCashShift"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let createRestaurantItemReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseRestaurantItemReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let cashAccountId = "";
let bankAccountId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function complete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

async function itemId(orderId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "restaurant_order_items"
    WHERE "restaurantOrderId"=${orderId}::uuid ORDER BY "createdAt", "id" LIMIT 1
  `;
  return rows[0]!.id;
}

async function cleanup() {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
  await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
  await db.cashBankAccount.deleteMany({ where: { workspaceId } });
  await db.account.deleteMany({ where: { workspaceId } });
  await db.product.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.auditLog.deleteMany({ where: { workspaceId } });
}

describe("restaurant V1.5 cash shift ledger reconciliation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ openCashShift } = await import("@/lib/server/industry-modules"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));
    ({ closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({ data: { clerkId: `cash-shift-${runId}`, email: `cash-shift-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Cash Shift ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    await Promise.all([
      createCashBankAccount(owner(), { name: "Drawer Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
      createCashBankAccount(owner(), { name: "Settlement Bank", openingBalance: 0, isBank: true, bankName: "Test Bank", accountTitle: "Restaurant", accountNumber: "001", notes: "" }),
    ]);
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => !account.isBank)!.cashBankAccountId;
    bankAccountId = accounts.find((account) => account.isBank)!.cashBankAccountId;

    const product = await db.product.create({ data: { workspaceId, name: "Cash Shift Drink", sku: `SHIFT-${runId}`, stockQuantity: 50, costPrice: 50, sellingPrice: 200 } });
    const category = await createRestaurantMenuCategory(owner(), { name: "Shift Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId: product.id, name: "Cash Shift Drink", price: 200 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup();
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("reconciles the physical drawer from posted non-bank cash ledger movements", async () => {
    const shift = await openCashShift(owner(), 100, "Opening drawer count");

    const cashOrder = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const cashPayment = await recordRestaurantPayment(owner(), { orderId: cashOrder.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200, idempotencyKey: `shift:${runId}:cash-a` });
    await complete(cashOrder.id);
    const cashOrderItem = await itemId(cashOrder.id);
    const returned = await createRestaurantItemReturn(owner(), {
      orderId: cashOrder.id,
      reason: "Temporary return for shift test",
      idempotencyKey: `shift:${runId}:return-a`,
      items: [{ orderItemId: cashOrderItem, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: cashPayment.id, amount: 200 }],
    });
    await reverseRestaurantItemReturn(owner(), returned.id, "Return entry corrected during same shift");

    const refundedOrder = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const refundedPayment = await recordRestaurantPayment(owner(), { orderId: refundedOrder.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200, idempotencyKey: `shift:${runId}:cash-b` });
    await complete(refundedOrder.id);
    await refundRestaurantPayment(owner(), { paymentId: refundedPayment.id, reason: "Full cash refund during same shift", idempotencyKey: `shift:${runId}:refund-b` });

    const bankOrder = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    await recordRestaurantPayment(owner(), { orderId: bankOrder.id, cashBankAccountId: bankAccountId, method: "CREDIT_CARD", amount: 200, idempotencyKey: `shift:${runId}:bank-c` });
    await complete(bankOrder.id);

    const result = await closeRestaurantCashShiftFromLedger(owner(), shift.id, 300, "Counted drawer at close");
    expect(result.openingCash).toBe(100);
    expect(result.cashInflows).toBe(600);
    expect(result.cashOutflows).toBe(400);
    expect(result.netCashMovement).toBe(200);
    expect(result.expectedCash).toBe(300);
    expect(result.closingCash).toBe(300);
    expect(result.variance).toBe(0);
    expect(result.ledgerEntryCount).toBeGreaterThanOrEqual(5);

    const [stored, audit] = await Promise.all([
      db.$queryRaw<Array<{ status: string; expectedCash: unknown; closingCash: unknown; variance: unknown }>>`
        SELECT "status", "expectedCash", "closingCash", "variance" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
      `,
      db.auditLog.findMany({ where: { workspaceId, action: "restaurant.cash_shift.closed", entityId: shift.id } }),
    ]);
    expect(stored[0]?.status).toBe("CLOSED");
    expect(Number(stored[0]?.expectedCash)).toBe(300);
    expect(Number(stored[0]?.closingCash)).toBe(300);
    expect(Number(stored[0]?.variance)).toBe(0);
    expect(audit).toHaveLength(1);
  });
});
