import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/auth", () => auth);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let db: typeof import("@/lib/server/db")["db"];
let workspaceId: string, menuItemId: string, userId: string;

// This synthetic POS fixture represents a PAYING customer. The paid-only
// entitlement guard must stay enabled; never bypass it in production code.
async function activateFixtureSubscription(id: string) {
  const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRaw`
    INSERT INTO "workspace_subscriptions"
      ("id", "workspaceId", "planId", "status", "currentPeriodStart", "currentPeriodEnd")
    VALUES (${subscriptionId}, ${id},
      (SELECT "id" FROM "saas_plans" WHERE "code"='starter' LIMIT 1),
      'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')
    ON CONFLICT ("workspaceId") DO UPDATE
      SET "status"='ACTIVE', "trialEndsAt"=NULL, "currentPeriodStart"=CURRENT_TIMESTAMP,
        "currentPeriodEnd"=CURRENT_TIMESTAMP + INTERVAL '30 days'
  `;
}

beforeAll(async () => {
  ({ db } = await import("@/lib/server/db"));
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `replay-${run}`, email: `${run}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `Replay ${run}`, members: { create: { userId: user.id, role: "OWNER" } } } });
  workspaceId = workspace.id;
  await activateFixtureSubscription(workspaceId);
  auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "OWNER", user });
  await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId", "moduleKey", enabled, config) VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb)`;
  const service = await import("@/lib/server/restaurant-workspace");
  const context = { workspaceId, userId: user.id, role: "OWNER" as const };
  const category = await service.createRestaurantMenuCategory(context, { name: "Replay meals" });
  const item = await service.createRestaurantMenuItem(context, { categoryId: category.id, name: "Replay meal", price: 100 });
  menuItemId = item.id;
});
afterAll(async () => { if (db) await db.$disconnect(); });

function form(key = randomUUID(), quantity = 1) {
  const data = new FormData();
  data.set("formWorkspaceId", workspaceId);
  data.set("orderRequestId", key);
  data.set("itemsJson", JSON.stringify([{ menuItemId, quantity }]));
  data.set("fulfillmentType", "TAKEAWAY");
  return data;
}
async function counts() {
  const orders = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM restaurant_orders WHERE "workspaceId"=${workspaceId}::uuid`;
  const tickets = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM kitchen_tickets WHERE "workspaceId"=${workspaceId}::uuid`;
  return { orders: Number(orders[0].count), tickets: Number(tickets[0].count), audit: await db.auditLog.count({ where: { workspaceId, action: "restaurant.order.created" } }) };
}
it("cashier order with an item allergy note creates exactly one confirmed kitchen ticket", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const { listRestaurantKitchenOrderLines, listRestaurantOrders } = await import("@/lib/server/restaurant-workspace");
  const data = form();
  data.set("itemsJson", JSON.stringify([{ menuItemId, quantity: 2, notes: "Peanut allergy; no onions" }]));
  data.set("notes", "Table customer requires careful handling");
  const before = await counts();
  const result = await createPosOrderAction({ status: "idle", message: "" }, data);
  expect(result).toMatchObject({ status: "success" });
  expect(result.orderNumber).toMatch(/^R-\d{6}$/);
  const orders = await db.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
    SELECT "id","status","orderNumber" FROM "restaurant_orders"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "externalReference"=${`pos:${data.get("orderRequestId")}`}
  `;
  expect(orders).toHaveLength(1);
  const order = orders[0];
  expect(order.status).toBe("CONFIRMED");
  expect(order.orderNumber).toBe(result.orderNumber);
  const tickets = await db.$queryRaw<Array<{ restaurantOrderId: string; ticketNumber: string }>>`
    SELECT "restaurantOrderId","ticketNumber" FROM "kitchen_tickets"
    WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
  `;
  expect(tickets).toEqual([{ restaurantOrderId: order.id, ticketNumber: `KOT-${order.orderNumber}` }]);
  expect(await listRestaurantKitchenOrderLines(workspaceId, [order.id])).toEqual([
    expect.objectContaining({ orderId: order.id, itemName: "Replay meal", quantity: 2,
      notes: "Peanut allergy; no onions", modifiers: [] }),
  ]);
  expect((await listRestaurantOrders(workspaceId, 200, { statuses: ["CONFIRMED"] }))
    .some((entry) => entry.id === order.id)).toBe(true);
  const retry = await createPosOrderAction({ status: "idle", message: "" }, data);
  expect(retry).toEqual(result);
  expect(await counts()).toEqual({
    orders: before.orders + 1, tickets: before.tickets + 1, audit: before.audit + 1,
  });
});

it("cashier partial payment, exact retry and second collection reconcile the printed receipt", async () => {
  const { createPosOrderAction, recordRestaurantPaymentAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");
  const { listRestaurantPayments } = await import("@/lib/server/restaurant-integrity");
  const { getRestaurantPrintDocument } = await import("@/lib/server/restaurant-print");

  const actor = { workspaceId, userId, role: "OWNER" as const };
  const created = await createCashBankAccount(actor, {
    name: `Cashier replay settlement ${randomUUID()}`,
    isBank: true, openingBalance: 0,
    bankName: "Synthetic testing bank", accountTitle: "Cashier verification",
    accountNumber: "000-123", notes: "",
  });
  const accountId = (await getCashBankAccounts(workspaceId))
    .find(account => account.id === created.id)?.cashBankAccountId;
  expect(accountId).toBeDefined();

  const orderData = form();
  const result = await createPosOrderAction({ status: "idle", message: "" }, orderData);
  expect(result.status).toBe("success");
  const [order] = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "restaurant_orders"
    WHERE "workspaceId"=${workspaceId}::uuid
    AND "externalReference"=${`pos:${orderData.get("orderRequestId")}`}
  `;
  expect(order?.id).toBeTruthy();

  function paymentForm(id: string, amount: number) {
    const data = new FormData();
    data.set("formWorkspaceId", workspaceId);
    data.set("orderId", order.id);
    data.set("cashBankAccountId", accountId!);
    data.set("method", "BANK_TRANSFER");
    data.set("amount", String(amount));
    data.set("paymentRequestId", id);
    data.set("reference", `bank-confirmation-${id}`);
    return data;
  }

  const firstId = `rp:${randomUUID()}`;
  const first = paymentForm(firstId, 40);
  expect((await recordRestaurantPaymentAction(first)).status).toBe("success");
  const partial = await getRestaurantPrintDocument(workspaceId, order.id);
  expect(partial).toMatchObject({ retainedPaid: 40, outstanding: 60, paymentStatus: "PARTIALLY_PAID" });

  expect((await recordRestaurantPaymentAction(first)).status).toBe("success");
  expect((await listRestaurantPayments(workspaceId, order.id)).filter(x => !x.voidedAt)).toHaveLength(1);

  const changed = paymentForm(firstId, 60);
  expect((await recordRestaurantPaymentAction(changed)).status).toBe("error");
  expect((await listRestaurantPayments(workspaceId, order.id)).filter(x => !x.voidedAt)).toHaveLength(1);

  const second = paymentForm(`rp:${randomUUID()}`, 60);
  expect((await recordRestaurantPaymentAction(second)).status).toBe("success");
  const receipt = await getRestaurantPrintDocument(workspaceId, order.id);
  expect(receipt).toMatchObject({
    orderNumber: result.orderNumber,
    retainedPaid: 100,
    outstanding: 0,
    paymentStatus: "PAID",
  });
  expect((await listRestaurantPayments(workspaceId, order.id)).filter(x => !x.voidedAt)).toHaveLength(2);
});

it("a repeated successful POS action produces one order, KOT and audit event", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form(); const before = await counts();
  const first = await createPosOrderAction({ status: "idle", message: "" }, data);
  const replay = await createPosOrderAction({ status: "idle", message: "" }, data);
  expect(first.status).toBe("success"); expect(replay).toEqual(first);
  expect(await counts()).toEqual({ orders: before.orders + 1, tickets: before.tickets + 1, audit: before.audit + 1 });
});
it("ten concurrent copies of one POS request create exactly one order", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form(); const before = await counts();
  const results = await Promise.all(Array.from({ length: 10 }, () => createPosOrderAction({ status: "idle", message: "" }, data)));
  expect(results.every(result => result.status === "success")).toBe(true);
  expect(new Set(results.map(result => result.message)).size).toBe(1);
  expect(await counts()).toEqual({ orders: before.orders + 1, tickets: before.tickets + 1, audit: before.audit + 1 });
}, 60_000);
it("a replay key cannot silently confirm a changed basket", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const key = randomUUID(); const before = await counts();
  expect((await createPosOrderAction({ status: "idle", message: "" }, form(key))).status).toBe("success");
  const result = await createPosOrderAction({ status: "idle", message: "" }, form(key, 2));
  expect(result.status).toBe("error"); expect(result.message).not.toMatch(/SQL|Prisma|constraint|[0-9a-f]{8}-/i);
  expect((await counts()).orders).toBe(before.orders + 1);
});
it("missing POS request identity is rejected before creating an order", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form(); data.delete("orderRequestId"); const before = await counts();
  expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("error");
  expect(await counts()).toEqual(before);
});
it("distinct request identities allow two intentionally identical orders", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const before = await counts();
  const results = await Promise.all([form(), form()].map(data => createPosOrderAction({ status: "idle", message: "" }, data)));
  expect(results.every(result => result.status === "success")).toBe(true);
  expect(new Set(results.map(result => result.message)).size).toBe(2);
  expect((await counts()).orders).toBe(before.orders + 2);
});
it("a retry reads the original receipt after a menu price change", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form();
  const first = await createPosOrderAction({ status: "idle", message: "" }, data);
  await db.$executeRaw`UPDATE restaurant_menu_items SET price=200 WHERE id=${menuItemId}::uuid`;
  try {
    expect(await createPosOrderAction({ status: "idle", message: "" }, data)).toEqual(first);
  } finally { await db.$executeRaw`UPDATE restaurant_menu_items SET price=100 WHERE id=${menuItemId}::uuid`; }
});
it("invalid cart entries remain controlled action errors", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const before = await counts();
  for (const cart of ["[null]", "{}", "null", "not-json"]) {
    const data = form(); data.set("itemsJson", cart);
    expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("error");
  }
  expect(await counts()).toEqual(before);
});
it("request identity is workspace scoped and cannot reuse a foreign menu ID", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const service = await import("@/lib/server/restaurant-workspace");
  const key = randomUUID();
  const original = await createPosOrderAction({ status: "idle", message: "" }, form(key));
  const other = await db.workspace.create({ data: { name: `Foreign replay ${key}`, members: { create: { userId, role: "OWNER" } } } });
  await activateFixtureSubscription(other.id);
  await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId", "moduleKey", enabled, config) VALUES (${other.id}::uuid, 'restaurant', true, '{}'::jsonb)`;
  const context = { workspaceId: other.id, userId, role: "OWNER" as const };
  const category = await service.createRestaurantMenuCategory(context, { name: "Foreign meals" });
  const item = await service.createRestaurantMenuItem(context, { categoryId: category.id, name: "Foreign meal", price: 100 });
  auth.requireWorkspace.mockResolvedValue({ workspaceId: other.id, role: "OWNER", user: { id: userId } });
  try {
    const data = form(key); data.set("formWorkspaceId", other.id);
    expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("error");
    data.set("itemsJson", JSON.stringify([{ menuItemId: item.id, quantity: 1 }]));
    expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("success");
  } finally { auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "OWNER", user: { id: userId } }); }
  expect(await createPosOrderAction({ status: "idle", message: "" }, form(key))).toEqual(original);
});
it("another actor cannot claim the prior request as their own successful basket", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form(); await createPosOrderAction({ status: "idle", message: "" }, data);
  const before = await counts();
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `other-${run}`, email: `${run}@example.invalid` } });
  await db.workspaceMember.create({ data: { workspaceId, userId: user.id, role: "STAFF" } });
  auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "STAFF", user });
  try { expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("error"); }
  finally { auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "OWNER", user: { id: userId } }); }
  expect(await counts()).toEqual(before);
});
it("replay does not bypass a revoked financial override permission", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const data = form(); data.set("discountAmount", "10");
  expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("success");
  auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "STAFF", user: { id: userId } });
  const before = await counts();
  try { expect((await createPosOrderAction({ status: "idle", message: "" }, data)).status).toBe("error"); }
  finally { auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "OWNER", user: { id: userId } }); }
  expect(await counts()).toEqual(before);
});
