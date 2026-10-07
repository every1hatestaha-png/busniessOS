import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

type RawExecutor = Pick<typeof db, "$executeRaw">;

async function fixture() {
  const id = randomUUID();
  const user = await db.user.create({ data: { clerkId: `v163-${id}`, email: `v163-${id}@example.invalid` } });
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `V163 ${id}`, vertical: "LEGACY", members: { create: { userId: user.id, role: "OWNER" } } },
    }),
    db.workspace.create({ data: { name: `V163 other ${id}`, vertical: "LEGACY" } }),
  ]);
  const workspaceId = workspace.id;
  const context = { workspaceId, role: "OWNER" as const, userId: user.id };
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
  `;

  const ledger = await createCashBankAccount(context, {
    name: `V163 Drawer ${id}`,
    openingBalance: 0,
    isBank: false,
    bankName: "",
    accountTitle: "",
    accountNumber: "",
    notes: "",
  });
  const accounts = await getCashBankAccounts(workspaceId);
  const cashBankAccountId = accounts.find(account => account.id === ledger.id)!.cashBankAccountId;
  const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
  const shift = await openRestaurantCashShiftSafely(context, 0, "V1.84 settlement ledger concurrency shift");

  const product = await db.product.create({ data: { workspaceId, name: `V163 Meal ${id}`, stockQuantity: 10, costPrice: 20, sellingPrice: 100 } });
  const category = await createRestaurantMenuCategory(context, { name: `V163 Menu ${id}` });
  const menu = await createRestaurantMenuItem(context, { categoryId: category.id, productId: product.id, name: `V163 Meal ${id}`, price: 100 });
  const order = await createPosRestaurantOrder(context, { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });

  return {
    workspaceId,
    otherWorkspaceId: otherWorkspace.id,
    userId: user.id,
    ledgerAccountId: ledger.id,
    cashBankAccountId,
    cashShiftId: shift.id,
    orderId: order.id,
  };
}

async function insertCashPayment(tx: RawExecutor, f: Awaited<ReturnType<typeof fixture>>, key: string) {
  return tx.$executeRaw`
    INSERT INTO "restaurant_payments" (
      "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "idempotencyKey", "createdById", "cashShiftId"
    ) VALUES (
      ${f.workspaceId}::uuid, ${f.orderId}::uuid, ${f.cashBankAccountId}, 'CASH', 10, ${key}, ${f.userId}, ${f.cashShiftId}::uuid
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

describe("restaurant V1.63 settlement-ledger reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets the first payment commit and then rejects a concurrent ledger workspace move", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const child = db.$transaction(async tx => {
      await insertCashPayment(tx, f, `v163:${randomUUID()}`);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.account.update({
      where: { id: f.ledgerAccountId },
      data: { workspaceId: f.otherWorkspaceId },
    }))();
    void parentMove.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked settlement ledger identity and accounting semantics are immutable");
    expect((await db.account.findUniqueOrThrow({ where: { id: f.ledgerAccountId } })).workspaceId).toBe(f.workspaceId);
  }, 30_000);

  it("rejects a stale payment after a concurrent ledger workspace move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.account.update({ where: { id: f.ledgerAccountId }, data: { workspaceId: f.otherWorkspaceId } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertCashPayment(db, f, `v163:${randomUUID()}`))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Restaurant payment settlement ledger account is invalid");
    expect((await db.account.findUniqueOrThrow({ where: { id: f.ledgerAccountId } })).workspaceId).toBe(f.otherWorkspaceId);
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_payments"
      WHERE "workspaceId"=${f.workspaceId}::uuid AND "restaurantOrderId"=${f.orderId}::uuid`;
    expect(rows[0]!.count).toBe(0);
  }, 30_000);

  it("rejects a stale payment after a concurrent ledger category change commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.account.update({ where: { id: f.ledgerAccountId }, data: { category: "EXPENSE" } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertCashPayment(db, f, `v163:${randomUUID()}`))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Restaurant payment settlement ledger account is invalid");
    expect((await db.account.findUniqueOrThrow({ where: { id: f.ledgerAccountId } })).category).toBe("EXPENSE");
  }, 30_000);
});
