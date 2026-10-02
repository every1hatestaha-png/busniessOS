import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const originalUrl = process.env.DATABASE_URL!;
let client: Client;
let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "", userId = "", accountId = "", productId = "", menuItemId = "", tableId = "";
let restaurant: typeof import("@/lib/server/restaurant-workspace");
let integrity: typeof import("@/lib/server/restaurant-integrity");
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
const context = () => ({ workspaceId, userId, role: "OWNER" as const });
const migrations = readdirSync(resolve("prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
const cutoff = "20261001123000_restaurant_other_payment_account_guard";
let pendingOrderId = "";

async function createOrder(quantity = 1, dineIn = false) {
  return restaurant.createPosRestaurantOrder(context(), { fulfillmentType: dineIn ? "DINE_IN" : "TAKEAWAY", restaurantTableId: dineIn ? tableId : undefined, items: [{ menuItemId, quantity }] });
}
async function pay(orderId: string, amount: number, method: "BANK_TRANSFER" | "OTHER" = "BANK_TRANSFER") {
  return collect(context(), { orderId, cashBankAccountId: accountId, method, amount, idempotencyKey: `history:${randomUUID()}` });
}
async function complete(orderId: string) {
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await integrity.transitionRestaurantOrderWithIntegrity(context(), orderId, status);
}
async function returnItem(orderId: string, paymentId: string, quantity: number) {
  const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${orderId}::uuid`;
  return createRestaurantItemReturn(context(), { orderId, reason: "Synthetic historical return", idempotencyKey: `history:${randomUUID()}`, items: [{ orderItemId: rows[0].id, quantity, restock: true }], paymentAllocations: [{ paymentId, amount: quantity*100 }] });
}
async function digest() {
  const tables = ["restaurant_orders", "restaurant_order_items", "restaurant_payments", "restaurant_refunds", "restaurant_returns", "restaurant_return_items", "restaurant_return_payment_allocations", "restaurant_inventory_consumptions", "restaurant_return_inventory_movements", "restaurant_whatsapp_messages", "kitchen_tickets", "cash_shifts", "restaurant_tables", "general_ledger_entries", "inventory_transactions", "products", "cash_bank_accounts", "audit_logs"];
  const result: Record<string, { count: number; sha: string }> = {};
  for (const table of tables) {
    const rows = (await client.query(`SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY t.id`)).rows.map((row) => row.row);
    result[table] = { count: rows.length, sha: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  return result;
}

beforeAll(async () => {
  const parsed = new URL(originalUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error("Historical rehearsal requires loopback PostgreSQL");
  const name = `restaurant_history_v188_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(parsed); adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); await admin.end();
  parsed.pathname = `/${name}`;
  client = new Client({ connectionString: parsed.toString() }); await client.connect();
  for (const migration of migrations.filter((name) => name < cutoff)) await client.query(readFileSync(resolve("prisma/migrations", migration, "migration.sql"), "utf8"));
  process.env.DATABASE_URL = parsed.toString();
  ({ db } = await import("@/lib/server/db"));
  restaurant = await import("@/lib/server/restaurant-workspace"); integrity = await import("@/lib/server/restaurant-integrity");
  ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `history-${run}`, email: `history-${run}@example.invalid` } }); userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `Historical synthetic ${run}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
  await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt") VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())`;
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const bank = await createCashBankAccount(context(), { name: "Historical synthetic bank", isBank: true, openingBalance: 0, bankName: "Synthetic", accountTitle: "Synthetic", accountNumber: "000", notes: "" });
  accountId = (await getCashBankAccounts(workspaceId)).find((account) => account.id === bank.id)!.cashBankAccountId;
  const product = await db.product.create({ data: { workspaceId, name: "Historical item", sku: `history-${run}`, stockQuantity: 100, costPrice: 25, sellingPrice: 100 } }); productId = product.id;
  const category = await restaurant.createRestaurantMenuCategory(context(), { name: "Historical menu" });
  menuItemId = (await restaurant.createRestaurantMenuItem(context(), { categoryId: category.id, productId, name: "Historical meal", price: 100 })).id;
  const { createRestaurantTable, createKitchenTicket } = await import("@/lib/server/industry-modules");
  tableId = (await createRestaurantTable(context(), { name: "Historical table", capacity: 4 })).id;
  const dineIn = await createOrder(1, true); await pay(dineIn.id,100); await complete(dineIn.id);
  tableId = (await createRestaurantTable(context(), { name: "Historical unpaid table", capacity: 2 })).id;
  const unpaidDineIn = await createOrder(1, true); await complete(unpaidDineIn.id);
  const unpaid = await createOrder(); await complete(unpaid.id);
  const partial = await createOrder(); await pay(partial.id,50); await complete(partial.id);
  const voided = await createOrder(); const voidPayment = await pay(voided.id,100); await integrity.voidRestaurantPayment(context(), voidPayment.id, "Synthetic historical void");
  const refunded = await createOrder(); const refundPayment = await pay(refunded.id,100); await complete(refunded.id);
  const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"); await refundRestaurantPayment(context(), { paymentId: refundPayment.id, reason: "Synthetic historical refund", idempotencyKey: `history:${randomUUID()}` });
  const partialReturn = await createOrder(2); const partialReturnPayment = await pay(partialReturn.id,200); await complete(partialReturn.id); await returnItem(partialReturn.id,partialReturnPayment.id,1);
  const fullReturn = await createOrder(); const fullReturnPayment = await pay(fullReturn.id,100); await complete(fullReturn.id); await returnItem(fullReturn.id,fullReturnPayment.id,1);
  const reversed = await createOrder(2); const reversedPayment = await pay(reversed.id,200); await complete(reversed.id); const returned = await returnItem(reversed.id,reversedPayment.id,1);
  const { reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals"); await reverseRestaurantItemReturn(context(), returned.id, "Synthetic historical reversal");
  const other = await createOrder(); await pay(other.id,100,"OTHER"); await complete(other.id);
  await createKitchenTicket(context(), { ticketNumber: `HIST-${run}` });
  await restaurant.ingestWhatsappRestaurantOrder(workspaceId, { externalMessageId: `history-${run}`, customerPhone: "03000000000", messageBody: "Synthetic history", items: [{ menuItemId, quantity: 1 }], fulfillmentType: "TAKEAWAY" });
  const shifts = await import("@/lib/server/restaurant-cash-shifts");
  const shift = await shifts.openRestaurantCashShiftSafely(context(), 0, "Historical closed shift");
  await shifts.closeRestaurantCashShiftFromLedger(context(), shift.id, 0, "Historical closed shift");
  await shifts.openRestaurantCashShiftSafely(context(),0,"Historical open shift");
  pendingOrderId = (await createOrder()).id;
}, 120_000);
afterAll(async () => { if (db) await db.$disconnect(); if (client) await client.end(); process.env.DATABASE_URL = originalUrl; });

describe("Restaurant V1.88 rich pre-V1.86 historical migration rehearsal", () => {
  it("preserves all seeded financial, inventory and operational snapshots through remaining migrations", async () => {
    const before = await digest();
    const started = performance.now();
    for (const migration of migrations.filter((name) => name >= cutoff)) await client.query(readFileSync(resolve("prisma/migrations", migration, "migration.sql"), "utf8"));
    expect(await digest()).toEqual(before);
    const { getRestaurantPrintDocument } = await import("@/lib/server/restaurant-print");
    const orders = await client.query('SELECT id FROM restaurant_orders WHERE "workspaceId"=$1',[workspaceId]);
    for (const row of orders.rows) expect(await getRestaurantPrintDocument(workspaceId,row.id)).not.toBeNull();
    expect(before.restaurant_returns.count).toBe(4);
    expect(before.restaurant_refunds.count).toBe(1);
    expect(before.restaurant_whatsapp_messages.count).toBe(1);
    expect(before.cash_shifts.count).toBe(2);
    expect(before.restaurant_tables.count).toBe(2);
    const dineInHistory = await client.query('SELECT status,"paymentStatus","restaurantTableId" FROM restaurant_orders WHERE "workspaceId"=$1::uuid AND "fulfillmentType"=\'DINE_IN\' ORDER BY "orderNumber"',[workspaceId]);
    expect(dineInHistory.rows).toHaveLength(2);
    expect(new Set(dineInHistory.rows.map(row => row.restaurantTableId)).size).toBe(2);
    expect(dineInHistory.rows.map(row => [row.status,row.paymentStatus])).toEqual([["COMPLETED","PAID"],["COMPLETED","UNPAID"]]);
    console.log(JSON.stringify({ migrations: migrations.length, historicalOrders: orders.rowCount, migrationMs: performance.now()-started, preserved: before }));
  }, 120_000);
  it("enforces the new OTHER physical-cash guard after historical upgrade", async () => {
    const account = (await client.query('SELECT id FROM cash_bank_accounts WHERE "workspaceId"=$1 LIMIT 1',[workspaceId])).rows[0].id;
    // Existing bank account is valid. A synthetic physical cash account is rejected.
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
    const cash = await createCashBankAccount(context(), { name: "New physical drawer", isBank: false, openingBalance: 0, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;
    await expect(client.query('INSERT INTO restaurant_payments ("workspaceId","restaurantOrderId","cashBankAccountId",method,amount,"createdById") VALUES ($1,$2,$3,\'OTHER\',10,$4)',[workspaceId,pendingOrderId,cashId,userId])).rejects.toThrow();
    expect(account).toBeTruthy();
    expect((await client.query('SELECT COUNT(*)::int AS count FROM restaurant_payments WHERE "restaurantOrderId"=$1',[pendingOrderId])).rows[0].count).toBe(0);
  });
});
