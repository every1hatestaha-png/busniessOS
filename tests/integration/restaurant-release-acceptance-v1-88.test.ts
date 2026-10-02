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

async function overlapOnOrder(orderId: string, operations: Array<() => Promise<unknown>>) {
  let unlock!: () => void, acquired!: () => void;
  const release = new Promise<void>(resolve => { unlock = resolve; });
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM restaurant_orders WHERE id=${orderId}::uuid FOR UPDATE`;
    acquired();
    await release;
  }, { timeout: 20_000 });
  await locked;
  const results = Promise.allSettled(operations.map(operation => operation()));
  try {
    let waiting = 0;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && waiting < operations.length) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM pg_stat_activity
        WHERE datname=current_database() AND pid<>pg_backend_pid()
          AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'
      `;
      waiting = rows[0].count;
      if (waiting < operations.length) await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(waiting).toBeGreaterThanOrEqual(operations.length);
  } finally { unlock(); await blocker; }
  return results;
}

it("payment, completion and cancellation overlap without mixed terminal effects", async () => {
  const order = await ready();
  const stock = Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity);
  const bank = Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  const outcomes = await overlapOnOrder(order.id, [
    () => collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 100, idempotencyKey: `collision:${randomUUID()}` }),
    () => integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED"),
    () => integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "CANCELLED"),
  ]);
  const doc = (await print(workspaceId, order.id))!;
  expect(["COMPLETED", "CANCELLED"]).toContain(doc.status);
  const completed = doc.status === "COMPLETED";
  const paid = outcomes[0].status === "fulfilled";
  expect(doc.payments).toHaveLength(paid ? 1 : 0);
  expect(doc.retainedPaid).toBe(paid ? 100 : 0);
  expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(stock - (completed ? 1 : 0));
  expect(Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance)).toBe(bank + (paid ? 100 : 0));
  const consumed = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM restaurant_inventory_consumptions WHERE "restaurantOrderId"=${order.id}::uuid`;
  expect(Number(consumed[0].count)).toBe(completed ? 1 : 0);
  const sale = await db.generalLedgerEntry.count({ where: { workspaceId, sourceType: "SALE", sourceId: order.id } });
  expect(sale > 0).toBe(completed);
  if (!completed) expect(paid).toBe(false);
  expect(await print(foreignWorkspaceId, order.id)).toBeNull();
  await assertBalancedLedger();
}, 60_000);

it("partial return, full refund and payment void overlap without double compensation", async () => {
  const order = await ready(2);
  const payment = await collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 200, idempotencyKey: `collision:${randomUUID()}` });
  await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED");
  const stock = Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity);
  const bank = Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  const [item] = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM restaurant_order_items WHERE "restaurantOrderId"=${order.id}::uuid`;
  const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
  const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds");
  await overlapOnOrder(order.id, [
    () => createRestaurantItemReturn(context(), { orderId: order.id, reason: "Synthetic collision return", idempotencyKey: `collision:${randomUUID()}`, items: [{ orderItemId: item.id, quantity: 1, restock: true }], paymentAllocations: [{ paymentId: payment.id, amount: 100 }] }),
    () => refundRestaurantPayment(context(), { paymentId: payment.id, reason: "Synthetic collision refund", idempotencyKey: `collision:${randomUUID()}` }),
    () => integrity.voidRestaurantPayment(context(), payment.id, "Synthetic collision void"),
  ]);
  const doc = (await print(workspaceId, order.id))!;
  expect(doc.status).toBe("COMPLETED");
  expect(doc.returns.length).toBeLessThanOrEqual(1);
  expect(doc.refunds.length).toBeLessThanOrEqual(1);
  const returned = doc.returns.length === 1;
  expect(doc.retainedPaid).toBe(returned ? 100 : 0);
  expect(doc.adjustedDue).toBe(returned ? 100 : 200);
  expect(Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance)).toBe(bank - (returned ? 100 : 200));
  expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(stock + (returned ? 1 : 0));
  if (returned) { expect(doc.refunds).toHaveLength(0); expect(doc.payments[0].voidedAt).toBeNull(); }
  else expect(doc.payments[0].voidedAt).not.toBeNull();
  await assertBalancedLedger();
}, 60_000);

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
  it("ten refund attempts reverse one receipt without repeating money or stock effects", async () => {
    const order = await ready();
    const payment = await collect(context(), { orderId: order.id, cashBankAccountId: bankId, method: "BANK_TRANSFER", amount: 100, idempotencyKey: `v188:${randomUUID()}` });
    await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "COMPLETED");
    const before = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } });
    const stock = (await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString();
    const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds");
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => refundRestaurantPayment(context(), { paymentId: payment.id, reason: "Synthetic concurrent refund", idempotencyKey: `v188:${randomUUID()}` })));
    expect(results.some((row) => row.status === "fulfilled")).toBe(true);
    const doc = await print(workspaceId, order.id);
    expect(doc).toMatchObject({ retainedPaid: 0, outstanding: 100, refunds: [{ amount: 100 }] });
    expect(doc!.refunds).toHaveLength(1);
    expect(doc!.payments[0].voidedAt).not.toBeNull();
    expect(Number(before.currentBalance) - Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance)).toBe(100);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString()).toBe(stock);
    expect(await db.auditLog.count({ where: { workspaceId, action: "restaurant.payment.refunded", entityId: results.find((row) => row.status === "fulfilled")!.value.id } })).toBe(1);
    await assertBalancedLedger();
  }, 120_000);
  it("ten independent orders competing for the last unit complete exactly one order", async () => {
    const run = randomUUID();
    const product = await db.product.create({ data: { workspaceId, name: "Last unit", sku: `last-${run}`, stockQuantity: 1, costPrice: 25, sellingPrice: 100 } });
    const category = await restaurant.createRestaurantMenuCategory(context(), { name: `Last unit ${run}` });
    const menu = await restaurant.createRestaurantMenuItem(context(), { categoryId: category.id, productId: product.id, name: "Last unit meal", price: 100 });
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const order = await restaurant.createPosRestaurantOrder(context(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });
      await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "PREPARING");
      await integrity.transitionRestaurantOrderWithIntegrity(context(), order.id, "READY");
      ids.push(order.id);
    }
    const results = await Promise.allSettled(ids.map((id) => integrity.transitionRestaurantOrderWithIntegrity(context(), id, "COMPLETED")));
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity)).toBe(0);
    for (let i = 0; i < ids.length; i++) {
      const completed = results[i].status === "fulfilled";
      const order = await restaurant.getRestaurantOrder(workspaceId, ids[i]);
      expect(order?.status).toBe(completed ? "COMPLETED" : "READY");
      const snapshots = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM restaurant_inventory_consumptions WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${ids[i]}::uuid`;
      expect(Number(snapshots[0].count)).toBe(completed ? 1 : 0);
      const ledger = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "SALE", sourceId: ids[i] } });
      if (completed) expect(ledger.length).toBeGreaterThan(0);
      else expect(ledger).toHaveLength(0);
    }
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

it("keeps an older completed receivable in the collection queue after newer cancelled history", async () => {
  const run = randomUUID();
  const workspace = await db.workspace.create({ data: { name: `Old receivable ${run}`, members: { create: { userId, role: "OWNER" } } } });
  const id = workspace.id;
  const owner = { workspaceId: id, userId, role: "OWNER" as const };
  await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled,config) VALUES (${id}::uuid,'restaurant',true,'{}'::jsonb)`;
  const category = await restaurant.createRestaurantMenuCategory(owner, { name: "Receivable meal" });
  const menu = await restaurant.createRestaurantMenuItem(owner, { categoryId: category.id, name: "Receivable meal", price: 100 });
  const order = await restaurant.createPosRestaurantOrder(owner, { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });
  for (const status of ["PREPARING","READY","COMPLETED"] as const) await integrity.transitionRestaurantOrderWithIntegrity(owner, order.id, status);
  await db.$executeRaw`INSERT INTO restaurant_orders ("workspaceId","orderNumber",source,"fulfillmentType",status,total,"createdById","createdAt") SELECT ${id}::uuid,'NEWER-CANCELLED-' || g::text,'MANUAL','TAKEAWAY','PENDING_REVIEW',100,${userId},now() FROM generate_series(1,201) g`;
  await db.$executeRaw`UPDATE restaurant_orders SET status='CANCELLED',"cancelledAt"=now(),"updatedAt"=now() WHERE "workspaceId"=${id}::uuid AND "orderNumber" LIKE 'NEWER-CANCELLED-%'`;
  expect((await restaurant.listRestaurantOrders(id,30,{ statuses:["COMPLETED","CANCELLED"] })).some((row) => row.id===order.id)).toBe(false);
  expect((await restaurant.listRestaurantOrders(id,200,{ statuses:["COMPLETED"],outstandingOnly:true,oldestFirst:true })).map((row) => row.id)).toEqual([order.id]);
  expect(await restaurant.listRestaurantOrders(foreignWorkspaceId,200,{ statuses:["COMPLETED"],outstandingOnly:true })).toEqual([]);
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const account = await createCashBankAccount(owner,{ name:"Receivable bank",isBank:true,openingBalance:0,bankName:"Synthetic",accountTitle:"Synthetic",accountNumber:"000",notes:"" });
  const bank = (await getCashBankAccounts(id)).find((row) => row.id===account.id)!.cashBankAccountId;
  await collect(owner,{ orderId:order.id,cashBankAccountId:bank,method:"BANK_TRANSFER",amount:100,idempotencyKey:`v188:${randomUUID()}` });
  expect(await restaurant.listRestaurantOrders(id,200,{ statuses:["COMPLETED"],outstandingOnly:true })).toEqual([]);
  expect(await print(id,order.id)).toMatchObject({ retainedPaid:100,outstanding:0 });
  const ledger = await db.generalLedgerEntry.findMany({ where:{workspaceId:id} });
  expect(ledger.reduce((sum,row) => sum+Number(row.debit)-Number(row.credit),0)).toBe(0);
},60_000);
