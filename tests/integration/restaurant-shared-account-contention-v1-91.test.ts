import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("four distinct order collections sharing one bank settle without exhausting retries", async () => {
  const { db } = await import("@/lib/server/db");
  const restaurant = await import("@/lib/server/restaurant-workspace");
  const { recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate");
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const { getRestaurantPrintDocument: print } = await import("@/lib/server/restaurant-print");
  try {
    const run = randomUUID();
    const user = await db.user.create({ data: { clerkId: `rc91-contention-${run}`, email: `${run}@example.invalid` } });
    const workspace = await db.workspace.create({ data: { name: "Synthetic shared-account collections", members: { create: { userId: user.id, role: "OWNER" } } } });
    const workspaceId = workspace.id, context = { workspaceId, userId: user.id, role: "OWNER" as const };
    await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled,config) VALUES (${workspaceId}::uuid,'restaurant',true,'{}'::jsonb)`;
    const category = await restaurant.createRestaurantMenuCategory(context, { name: "Meals" });
    const menu = await restaurant.createRestaurantMenuItem(context, { categoryId: category.id, name: "Synthetic meal", price: 100 });
    const bank = await createCashBankAccount(context, { name: "Synthetic shared bank", isBank: true, openingBalance: 0, bankName: "Synthetic", accountTitle: "Synthetic", accountNumber: "000", notes: "" });
    const bankId = (await getCashBankAccounts(workspaceId)).find(account => account.id === bank.id)!.cashBankAccountId;

    for (let batch = 1; batch <= 3; batch++) {
      const orders = [];
      for (let index = 0; index < 4; index++) orders.push(await restaurant.createPosRestaurantOrder(context, { idempotencyKey: randomUUID(), fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] }));
      const requests = orders.map(order => ({ orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER" as const, amount: 100, idempotencyKey: randomUUID() }));
      const results = await Promise.allSettled(requests.map(request => collect(context, request)));
      expect(results.filter(result => result.status === "rejected").map(result => result.reason), `batch ${batch} must settle four distinct orders`).toEqual([]);
      for (const order of orders) expect((await print(workspaceId, order.id))?.outstanding).toBe(0);
      const replay = await Promise.all(requests.map(request => collect(context, request)));
      expect(new Set(replay.map(payment => payment.id)).size).toBe(4);
      expect(replay.every(payment => payment.idempotent)).toBe(true);
      const count = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM restaurant_payments WHERE "workspaceId"=${workspaceId}::uuid`;
      expect(Number(count[0].count)).toBe(batch * 4);
      expect(Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance)).toBe(batch * 400);
      expect(await db.auditLog.count({ where: { workspaceId, action: "restaurant.payment.recorded" } })).toBe(batch * 4);
      expect(await db.generalLedgerEntry.count({ where: { workspaceId, sourceType: "RECEIPT" } })).toBe(batch * 8);
      const imbalance = await db.$queryRaw<Array<unknown>>`SELECT "sourceId" FROM general_ledger_entries WHERE "workspaceId"=${workspaceId} GROUP BY "sourceType","sourceId" HAVING SUM(debit-credit)<>0`;
      expect(imbalance).toHaveLength(0);
    }
  } finally { await db.$disconnect(); }
}, 60_000);
