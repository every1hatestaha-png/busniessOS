import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";

// Called only by the loopback query-plan harness. Financial evidence is created
// through the real services, with all database guards enabled.
it.skipIf(!process.env.RESTAURANT_PERF_WORKSPACE_ID)("adds guarded financial history to the synthetic load workspace", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/munshios_restaurant_perf") throw new Error("Performance fixture requires the dedicated loopback database");
  const workspaceId = process.env.RESTAURANT_PERF_WORKSPACE_ID!;
  const userId = process.env.RESTAURANT_PERF_USER_ID!;
  const context = { workspaceId, userId, role: "OWNER" as const };
  const { db } = await import("@/lib/server/db");
  try {
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
    const { createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace");
    const { transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity");
    const { recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate");
    const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
    const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds");
    const shifts = await import("@/lib/server/restaurant-cash-shifts");
    const bank = await createCashBankAccount(context, { name: "Guarded performance bank", isBank: true, openingBalance: 0, bankName: "Synthetic", accountTitle: "Synthetic", accountNumber: "000", notes: "" });
    const cash = await createCashBankAccount(context, { name: "Guarded performance drawer", isBank: false, openingBalance: 0, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const accounts = await getCashBankAccounts(workspaceId);
    const bankId = accounts.find((row) => row.id === bank.id)!.cashBankAccountId;
    const cashId = accounts.find((row) => row.id === cash.id)!.cashBankAccountId;
    const menu = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM restaurant_menu_items WHERE "workspaceId"=${workspaceId}::uuid LIMIT 1`;
    async function settled(accountId: string, method: "BANK_TRANSFER" | "CASH") {
      const order = await createPosRestaurantOrder(context, { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu[0].id, quantity: 1 }] });
      const payment = await recordRestaurantPaymentAtCollection(context, { orderId: order.id, cashBankAccountId: accountId, method, amount: 100, idempotencyKey: `perf:${randomUUID()}` });
      for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await transitionRestaurantOrderWithIntegrity(context, order.id, status);
      return { order, payment };
    }
    const returned = await settled(bankId, "BANK_TRANSFER");
    const item = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM restaurant_order_items WHERE "restaurantOrderId"=${returned.order.id}::uuid`;
    await createRestaurantItemReturn(context, { orderId: returned.order.id, reason: "Synthetic load return", idempotencyKey: `perf:${randomUUID()}`, items: [{ orderItemId: item[0].id, quantity: 1, restock: false }], paymentAllocations: [{ paymentId: returned.payment.id, amount: 100 }] });
    const refunded = await settled(bankId, "BANK_TRANSFER");
    await refundRestaurantPayment(context, { paymentId: refunded.payment.id, reason: "Synthetic load refund", idempotencyKey: `perf:${randomUUID()}` });
    const shift = await shifts.openRestaurantCashShiftSafely(context, 0, "Synthetic load cash shift");
    await settled(cashId, "CASH");
    expect(await shifts.closeRestaurantCashShiftFromLedger(context, shift.id, 100)).toMatchObject({ expectedCash: 100, variance: 0 });
    const balances = await db.$queryRaw<Array<{ balance: string }>>`SELECT SUM(debit-credit)::text AS balance FROM general_ledger_entries WHERE "workspaceId"=${workspaceId}`;
    expect(Number(balances[0].balance)).toBe(0);
  } finally { await db.$disconnect(); }
}, 120_000);
