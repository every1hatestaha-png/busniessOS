import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
let db: typeof import("@/lib/server/db")["db"];
let restaurant: typeof import("@/lib/server/restaurant-workspace");
let integrity: typeof import("@/lib/server/restaurant-integrity");
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let workspaceId: string, userId: string, staffId: string, foreignId: string, productId: string, bankId: string, orderId: string, paymentId: string;
const owner = () => ({ workspaceId, userId, role: "OWNER" as const });
beforeAll(async () => {
  ({ db } = await import("@/lib/server/db")); restaurant = await import("@/lib/server/restaurant-workspace");
  integrity = await import("@/lib/server/restaurant-integrity");
  ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
  const run = randomUUID();
  const users = await Promise.all(["owner", "staff", "foreign"].map(name => db.user.create({ data: { clerkId: `round3-${name}-${run}`, email: `${name}-${run}@example.invalid` } })));
  [userId, staffId, foreignId] = users.map(user => user.id);
  const workspace = await db.workspace.create({ data: { name: `Round3 authorization ${run}`, vertical: "RESTAURANT", members: { create: [
    { userId, role: "OWNER" }, { userId: staffId, role: "STAFF", restaurantStation: "POS" },
  ] } } }); workspaceId = workspace.id;
  await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId", "moduleKey", enabled, config) VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb)`;
  const product = await db.product.create({ data: { workspaceId, name: "Synthetic meal stock", sku: run, stockQuantity: 10, costPrice: 25, sellingPrice: 100 } }); productId = product.id;
  const category = await restaurant.createRestaurantMenuCategory(owner(), { name: "Synthetic meals" });
  const menu = await restaurant.createRestaurantMenuItem(owner(), { categoryId: category.id, productId, name: "Synthetic meal", price: 100 });
  const accounting = await import("@/lib/server/accounting");
  const account = await accounting.createCashBankAccount(owner(), { name: "Round3 synthetic bank", isBank: true, openingBalance: 0, bankName: "Synthetic", accountTitle: "Synthetic", accountNumber: "000" });
  bankId = (await accounting.getCashBankAccounts(workspaceId)).find(row => row.id === account.id)!.cashBankAccountId;
  const order = await restaurant.createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] }); orderId = order.id;
  await integrity.transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await integrity.transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  const payment = await collect({ workspaceId, userId: staffId, role: "STAFF" }, { orderId, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 100, idempotencyKey: randomUUID() }); paymentId = payment.id;
}, 60_000);
afterAll(async () => { if (db) await db.$disconnect(); });

async function snapshot() {
  return {
    order: await db.$queryRaw`SELECT * FROM restaurant_orders WHERE id=${orderId}::uuid`,
    payment: await db.$queryRaw`SELECT * FROM restaurant_payments WHERE id=${paymentId}::uuid`,
    ticket: await db.$queryRaw`SELECT * FROM kitchen_tickets WHERE "restaurantOrderId"=${orderId}::uuid`,
    stock: await db.product.findUnique({ where: { id: productId } }),
    gl: await db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    balance: await db.cashBankAccount.findUnique({ where: { id: bankId } }),
    audit: await db.auditLog.count({ where: { workspaceId } }),
  };
}
it("rejects direct STAFF completion and void without financial, stock or tenant changes", async () => {
  const before = await snapshot(); const staff = { workspaceId, userId: staffId, role: "STAFF" as const };
  await expect(integrity.transitionRestaurantOrderWithIntegrity(staff, orderId, "COMPLETED")).rejects.toThrow("Manager access");
  await expect(integrity.voidRestaurantPayment(staff, paymentId, "Synthetic void")).rejects.toThrow("Manager access");
  expect(await snapshot()).toEqual(before);
});
it("denies stale claimed manager roles, foreign actors and removed membership", async () => {
  const before = await snapshot();
  for (const id of [staffId, foreignId]) {
    const stale = { workspaceId, userId: id, role: "OWNER" as const };
    await expect(integrity.transitionRestaurantOrderWithIntegrity(stale, orderId, "COMPLETED")).rejects.toThrow("manager actor from the same workspace");
    await expect(integrity.voidRestaurantPayment(stale, paymentId, "Synthetic void")).rejects.toThrow("manager actor from the same workspace");
  }
  await db.workspaceMember.deleteMany({ where: { workspaceId, userId: staffId } });
  await expect(integrity.transitionRestaurantOrderWithIntegrity({ workspaceId, userId: staffId, role: "MANAGER" }, orderId, "COMPLETED")).rejects.toThrow("manager actor");
  expect(await snapshot()).toEqual(before);
  await db.workspaceMember.create({ data: { workspaceId, userId: staffId, role: "STAFF", restaurantStation: "POS" } });
});
it("denies direct stale kitchen/terminal paths while permitting persisted kitchen transitions", async () => {
  const before = await snapshot(); const staff = { workspaceId, userId: staffId, role: "STAFF" as const };
  await expect(restaurant.transitionRestaurantOrder(staff, orderId, "READY")).rejects.toThrow("KITCHEN station");
  await expect(restaurant.transitionRestaurantOrder(owner(), orderId, "COMPLETED")).rejects.toThrow("integrity service");
  expect(await snapshot()).toEqual(before);
  await db.workspaceMember.updateMany({ where: { workspaceId, userId: staffId }, data: { restaurantStation: "KITCHEN" } });
  expect(await restaurant.transitionRestaurantOrder(staff, orderId, "READY")).toMatchObject({ status: "READY" });
});
it("allows the real manager to finalize exactly once with balanced GL and one stock consumption", async () => {
  await integrity.transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
  const completed = await snapshot();
  await integrity.transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
  expect(await snapshot()).toEqual(completed);
  expect(Number(completed.stock!.stockQuantity)).toBe(9);
  const sums = await db.$queryRaw<Array<{ balance: string }>>`SELECT SUM(debit-credit)::text AS balance FROM general_ledger_entries WHERE "workspaceId"=${workspaceId}`;
  expect(Number(sums[0].balance)).toBe(0);
});
