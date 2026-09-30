import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

async function fixture() {
  const id = randomUUID();
  const user = await db.user.create({ data: { clerkId: `v161-${id}`, email: `v161-${id}@example.invalid` } });
  const workspace = await db.workspace.create({
    data: { name: `V161 ${id}`, vertical: "LEGACY", members: { create: { userId: user.id, role: "OWNER" } } },
  });
  const workspaceId = workspace.id;
  const context = { workspaceId, role: "OWNER" as const, userId: user.id };
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
  `;
  const ledger = await createCashBankAccount(context, {
    name: `V161 Drawer ${id}`,
    openingBalance: 0,
    isBank: false,
    bankName: "",
    accountTitle: "",
    accountNumber: "",
    notes: "",
  });
  const accounts = await getCashBankAccounts(workspaceId);
  const cashBankAccountId = accounts.find(account => account.id === ledger.id)!.cashBankAccountId;
  const product = await db.product.create({ data: { workspaceId, name: `V161 Meal ${id}`, stockQuantity: 10, costPrice: 20, sellingPrice: 100 } });
  const category = await createRestaurantMenuCategory(context, { name: `V161 Menu ${id}` });
  const menu = await createRestaurantMenuItem(context, { categoryId: category.id, productId: product.id, name: `V161 Meal ${id}`, price: 100 });
  const order = await createPosRestaurantOrder(context, { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });
  return { workspaceId, userId: user.id, cashBankAccountId, orderId: order.id };
}

async function insertCashPayment(
  tx: typeof db,
  f: Awaited<ReturnType<typeof fixture>>,
  key: string,
) {
  return tx.$executeRaw`
    INSERT INTO "restaurant_payments" (
      "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "idempotencyKey", "createdById"
    ) VALUES (
      ${f.workspaceId}::uuid, ${f.orderId}::uuid, ${f.cashBankAccountId}, 'CASH', 10, ${key}, ${f.userId}
    )
  `;
}

async function waitForLockWait() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM pg_stat_activity
      WHERE datname=current_database()
        AND pid<>pg_backend_pid()
        AND wait_event_type='Lock'`;
    if (rows[0]!.count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected a PostgreSQL lock wait");
}

function controlledHold() {
  let release!: () => void;
  let ready!: () => void;
  return {
    hold: new Promise<void>(resolve => { release = resolve; }),
    signal: new Promise<void>(resolve => { ready = resolve; }),
    release: () => release(),
    ready: () => ready(),
  };
}

describe("restaurant V1.61 settlement-account reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets a new payment commit first and then rejects the concurrent account delete", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const child = db.$transaction(async tx => {
      await insertCashPayment(tx as typeof db, f, `v161:${randomUUID()}`);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const deletion = (async () => db.cashBankAccount.delete({ where: { id: f.cashBankAccountId } }))();
    void deletion.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(deletion).rejects.toThrow("Restaurant-linked settlement account cannot be deleted");
    expect(await db.cashBankAccount.findUnique({ where: { id: f.cashBankAccountId } })).not.toBeNull();
  }, 30_000);

  it("revalidates payment method after a concurrent parent type change commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const parent = db.$transaction(async tx => {
      await tx.cashBankAccount.update({ where: { id: f.cashBankAccountId }, data: { isBank: true } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertCashPayment(db, f, `v161:${randomUUID()}`))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Cash restaurant payments must use a physical cash account");
    expect((await db.cashBankAccount.findUniqueOrThrow({ where: { id: f.cashBankAccountId } })).isBank).toBe(true);
    const count = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_payments"
      WHERE "workspaceId"=${f.workspaceId}::uuid AND "restaurantOrderId"=${f.orderId}::uuid`;
    expect(count[0]!.count).toBe(0);
  }, 30_000);

  it("rejects a stale payment reference after a concurrent parent delete commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const parent = db.$transaction(async tx => {
      await tx.cashBankAccount.delete({ where: { id: f.cashBankAccountId } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertCashPayment(db, f, `v161:${randomUUID()}`))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Cross-workspace restaurant payment cash account reference rejected");
    expect(await db.cashBankAccount.findUnique({ where: { id: f.cashBankAccountId } })).toBeNull();
  }, 30_000);
});
