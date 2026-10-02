import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let restaurant: typeof import("@/lib/server/restaurant-workspace");
let integrity: typeof import("@/lib/server/restaurant-integrity");
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let print: typeof import("@/lib/server/restaurant-print")["getRestaurantPrintDocument"];
let workspaceId = "", userId = "", foreignWorkspaceId = "", productId = "", menuItemId = "", bankId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

beforeAll(async () => {
  ({ db } = await import("@/lib/server/db"));
  restaurant = await import("@/lib/server/restaurant-workspace");
  integrity = await import("@/lib/server/restaurant-integrity");
  ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
  ({ getRestaurantPrintDocument: print } = await import("@/lib/server/restaurant-print"));
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `v188-${run}`, email: `v188-${run}@example.invalid` } }); userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `V188 synthetic ${run}`, timezone: "America/New_York", members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
  const foreign = await db.workspace.create({ data: { name: `V188 foreign ${run}`, members: { create: { userId, role: "OWNER" } } } }); foreignWorkspaceId = foreign.id;
  for (const id of [workspaceId, foreignWorkspaceId]) await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt") VALUES (${id}::uuid, 'restaurant', true, '{}'::jsonb, now())`;
  const product = await db.product.create({ data: { workspaceId, name: "Original inventory name", sku: `v188-${run}`, stockQuantity: 100, costPrice: 25, sellingPrice: 100 } }); productId = product.id;
  const category = await restaurant.createRestaurantMenuCategory(context(), { name: "Synthetic meals" });
  const menu = await restaurant.createRestaurantMenuItem(context(), { categoryId: category.id, productId, name: "Original receipt meal", price: 100 }); menuItemId = menu.id;
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const account = await createCashBankAccount(context(), { name: "V188 bank", isBank: true, openingBalance: 0, bankName: "Synthetic", accountTitle: "Synthetic", accountNumber: "000", notes: "" });
  bankId = (await getCashBankAccounts(workspaceId)).find((a) => a.id === account.id)!.cashBankAccountId;
}, 60_000);
afterAll(async () => { if (db) await db.$disconnect(); });

async function ready(quantity = 1) {
  const order = await restaurant.createPosRestaurantOrder(context(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity, notes: "No onions", modifiers: ["Extra sauce"] }] });
  await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "PREPARING");
  await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "READY");
  return order;
}
async function assertBalancedLedger() {
  const rows = await db.$queryRaw<Array<{ balance: string }>>`SELECT COALESCE(SUM("debit"-"credit"),0)::text AS balance FROM "general_ledger_entries" WHERE "workspaceId"=${workspaceId}`;
  expect(Number(rows[0].balance)).toBe(0);
}

describe("Restaurant V1.88 synthetic acceptance", () => {
  it("prints historical item snapshots and rejects direct foreign/invalid URLs", async () => {
    const order = await ready(2);
    await collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 200, idempotencyKey: `v188:${randomUUID()}` });
    await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED");
    await db.product.update({ where: { id: productId }, data: { name: "Renamed product", sellingPrice: 999 } });
    await db.$executeRaw`UPDATE "restaurant_menu_items" SET "name"='Renamed menu', "price"=999 WHERE "id"=${menuItemId}::uuid`;
    const doc = await print(workspaceId, order.id);
    expect(doc).toMatchObject({ total: 200, adjustedDue: 200, retainedPaid: 200, outstanding: 0, timezone: "America/New_York", status: "COMPLETED" });
    expect(doc!.items[0]).toMatchObject({ itemName: "Original receipt meal", unitPrice: 100, quantity: 2, notes: "No onions", modifiers: ["Extra sauce"] });
    expect(doc!.payments[0]).toMatchObject({ method: "BANK_TRANSFER", amount: 200 });
    expect(await print(foreignWorkspaceId, order.id)).toBeNull();
    expect(await print(workspaceId, "invalid-uuid")).toBeNull();
    await assertBalancedLedger();
    // Restore only mutable catalogue price for subsequent independent scenarios.
    await db.$executeRaw`UPDATE "restaurant_menu_items" SET "price"=100 WHERE "id"=${menuItemId}::uuid`;
  });
  it("shows net retained payments through partial return and reversal", async () => {
    const order = await ready(2);
    const payment = await collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 200, idempotencyKey: `v188:${randomUUID()}` });
    await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED");
    const items = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid`;
    const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
    const returned = await createRestaurantItemReturn(context(), { orderId: order.id, reason: "Synthetic partial return", idempotencyKey: `v188:${randomUUID()}`, items: [{ orderItemId: items[0].id, quantity: 1, restock: true }], paymentAllocations: [{ paymentId: payment.id, amount: 100 }] });
    expect(await print(workspaceId, order.id)).toMatchObject({ adjustedDue: 100, retainedPaid: 100, outstanding: 0, returns: [{ total: 100, isReversal: false }] });
    const { reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals");
    await reverseRestaurantItemReturn(context(), returned.id, "Synthetic correction");
    const doc = await print(workspaceId, order.id);
    expect(doc).toMatchObject({ adjustedDue: 200, retainedPaid: 200, outstanding: 0 });
    expect(doc!.returns.map((r) => r.total).sort((a,b) => a-b)).toEqual([-100,100]);
    await assertBalancedLedger();
  });
  it("ten finalizers produce one stock and financial effect", async () => {
    const order = await ready();
    const stockBefore = Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity);
    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED")));
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(stockBefore-1);
    const evidence = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid`;
    expect(Number(evidence[0].count)).toBe(1);
    const ledgerAfter = await db.generalLedgerEntry.count({ where: { workspaceId } });
    await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED");
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBe(ledgerAfter);
    expect(ledgerAfter-ledgerBefore).toBeGreaterThan(0);
    await assertBalancedLedger();
  }, 120_000);
  it("ten final payment attempts retain exactly one payment", async () => {
    const order = await ready();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 100, idempotencyKey: `v188:${randomUUID()}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const doc = await print(workspaceId, order.id);
    expect(doc).toMatchObject({ retainedPaid: 100, outstanding: 0 });
    expect(doc!.payments).toHaveLength(1);
    await assertBalancedLedger();
  }, 120_000);
});

it("active kitchen orders remain visible behind more than 200 newer closed orders", async () => {
  const order = await ready();
  await db.$executeRaw`
    INSERT INTO "restaurant_orders" ("workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus", "total", "createdById", "createdAt", "updatedAt")
    SELECT ${workspaceId}::uuid, 'SYNTHETIC-CLOSED-' || g::text, 'MANUAL', 'TAKEAWAY', 'COMPLETED', 'UNPAID', 100, ${userId}, now() + (g * interval '1 second'), now()
    FROM generate_series(1,201) g
  `;
  const unfiltered = await restaurant.listRestaurantOrders(workspaceId,200);
  expect(unfiltered.some((row) => row.id === order.id)).toBe(false);
  const kitchen = await restaurant.listRestaurantOrders(workspaceId,200,{ statuses: ["CONFIRMED","PREPARING","READY"], oldestFirst:true });
  expect(kitchen.some((row) => row.id === order.id)).toBe(true);
  expect(kitchen.every((row) => ["CONFIRMED","PREPARING","READY"].includes(row.status))).toBe(true);
  const foreign = await restaurant.listRestaurantOrders(foreignWorkspaceId,200,{ statuses:["READY"], oldestFirst:true });
  expect(foreign).toEqual([]);
});

it("concurrent first cash/bank account creation retries only the recognised unique conflicts", async () => {
  const run = randomUUID();
  const workspace = await db.workspace.create({ data: { name: `Bootstrap concurrency ${run}`, members: { create: { userId, role: "OWNER" } } } });
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const bootstrapContext = { workspaceId: workspace.id, userId, role: "OWNER" as const };
  const results = await Promise.all([
    createCashBankAccount(bootstrapContext,{ name:"Concurrent drawer", isBank:false, openingBalance:0,bankName:"",accountTitle:"",accountNumber:"",notes:"" }),
    createCashBankAccount(bootstrapContext,{ name:"Concurrent bank", isBank:true, openingBalance:0,bankName:"Synthetic",accountTitle:"Synthetic",accountNumber:"000",notes:"" }),
  ]);
  expect(new Set(results.map((row) => row.id)).size).toBe(2);
  const accounts = await getCashBankAccounts(workspace.id);
  expect(accounts.some((row) => row.name === "Concurrent drawer")).toBe(true);
  expect(accounts.some((row) => row.name === "Concurrent bank")).toBe(true);
  const defaults = await db.account.findMany({ where: { workspaceId: workspace.id, systemCode: { not:null } } });
  expect(new Set(defaults.map((row) => row.systemCode)).size).toBe(defaults.length);
},60_000);
