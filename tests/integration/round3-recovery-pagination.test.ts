import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { salesPageOptions } from "@/lib/sales-pagination";
let db: typeof import("@/lib/server/db")["db"];
let budget: typeof import("@/lib/server/auth-recovery-rate-limit");
let sales: typeof import("@/lib/server/sales");
const run = randomUUID();
beforeAll(async () => {
  ({ db } = await import("@/lib/server/db"));
  budget = await import("@/lib/server/auth-recovery-rate-limit");
  sales = await import("@/lib/server/sales");
});
afterAll(async () => { if (db) await db.$disconnect(); });

describe("distributed recovery budget on disposable Postgres", () => {
  it("admits exactly three of 20 concurrent requests across independent connections", async () => {
    const email = `concurrent-${run}@example.invalid`;
    const results = await Promise.all(Array.from({ length: 20 }, (_,i) => budget.consumeRecoveryEmailBudget(i % 2 ? ` ${email.toUpperCase()} ` : email)));
    expect(results.filter(Boolean)).toHaveLength(budget.RECOVERY_EMAIL_LIMIT);
    const before = await db.authRecoveryBucket.findUniqueOrThrow({ where: { emailHash: budget.recoveryEmailHash(email) } });
    expect(before.attempts).toBe(3);
    expect(await budget.consumeRecoveryEmailBudget(email)).toBe(false);
    expect(await db.authRecoveryBucket.findUniqueOrThrow({ where: { emailHash: before.emailHash } })).toEqual(before);
  });
  it("resets an expired window atomically under concurrency and isolates email keys", async () => {
    const email = `expired-${run}@example.invalid`, hash = budget.recoveryEmailHash(email);
    await db.authRecoveryBucket.create({ data: { emailHash: hash, attempts: 3, windowStartedAt: new Date(Date.now() - 16 * 60_000) } });
    const results = await Promise.all(Array.from({ length: 10 }, () => budget.consumeRecoveryEmailBudget(email)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await budget.consumeRecoveryEmailBudget(`other-${run}@example.invalid`)).toBe(true);
    expect((await db.authRecoveryBucket.findUniqueOrThrow({ where: { emailHash: hash } })).attempts).toBe(3);
  });
  it("prunes at most 64 expired hashes while retaining active buckets", async () => {
    const keys = Array.from({ length: 70 }, (_,i) => budget.recoveryEmailHash(`prune-${run}-${i}@example.invalid`));
    await db.authRecoveryBucket.createMany({ data: keys.map(emailHash => ({ emailHash, attempts: 1, windowStartedAt: new Date(Date.now() - 2 * 86_400_000) })) });
    await budget.consumeRecoveryEmailBudget(`cleanup-${run}@example.invalid`);
    expect(await db.authRecoveryBucket.count({ where: { emailHash: { in: keys } } })).toBe(6);
    expect(await budget.consumeRecoveryEmailBudget(`concurrent-${run}@example.invalid`)).toBe(false);
  });
});

describe("sales pagination with real tied dates and tenants", () => {
  it("walks every row once, excludes foreign sales and searches beyond the first page", async () => {
    const a = await db.workspace.create({ data: { name: `Cursor A ${run}` } });
    const b = await db.workspace.create({ data: { name: `Cursor B ${run}` } });
    const ca = await db.customer.create({ data: { workspaceId: a.id, name: "Synthetic buyer" } });
    const cb = await db.customer.create({ data: { workspaceId: b.id, name: "Foreign buyer" } });
    const date = new Date("2026-10-01T12:00:00.000Z");
    await db.salesOrder.createMany({ data: Array.from({ length: 125 }, (_,i) => ({ workspaceId: a.id, customerId: ca.id, orderNumber: `CURSOR-${String(i).padStart(3,"0")}`, orderDate: date, status: "DRAFT" as const })) });
    const foreign = await db.salesOrder.create({ data: { workspaceId: b.id, customerId: cb.id, orderNumber: "FOREIGN", orderDate: date } });
    const expected = await db.salesOrder.findMany({ where: { workspaceId: a.id }, orderBy: [{ orderDate: "desc" }, { id: "desc" }], select: { id: true } });
    const seen: string[] = []; let cursor: string | null = null; let pages = 0;
    do {
      const page = await sales.listSalesPage(a.id, salesPageOptions(new URLSearchParams(cursor ? { cursor } : {})));
      expect(page.data.length).toBeLessThanOrEqual(50);
      seen.push(...page.data.map(row => row.id)); cursor = page.pagination.nextCursor; pages++;
      expect(pages).toBeLessThan(5);
    } while (cursor);
    expect(pages).toBe(3); expect(seen).toEqual(expected.map(row => row.id)); expect(seen).not.toContain(foreign.id);
    const first = await sales.listSalesPage(a.id, salesPageOptions(new URLSearchParams()));
    await expect(sales.listSalesPage(b.id, salesPageOptions(new URLSearchParams({ cursor: first.pagination.nextCursor! })))).rejects.toThrow("Invalid sales cursor");
    const lastNumber = (await db.salesOrder.findUniqueOrThrow({ where: { id: seen.at(-1)! } })).orderNumber;
    expect((await sales.listSalesPage(a.id, salesPageOptions(new URLSearchParams({ q: lastNumber, status: "DRAFT" })))).data).toHaveLength(1);
  });
});
