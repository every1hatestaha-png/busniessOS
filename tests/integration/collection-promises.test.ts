import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "";
let otherWorkspaceId = "";
let userId = "";
let customerId = "";

const runId = `collection-promises-${Date.now()}`;
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  ({ db } = await import("@/lib/server/db"));

  const user = await db.user.create({ data: { clerkId: runId, email: `${runId}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `Promises ${runId}`, members: { create: { userId, role: "OWNER" } } } });
  workspaceId = workspace.id;
  const other = await db.workspace.create({ data: { name: `Other ${runId}` } });
  otherWorkspaceId = other.id;

  const customer = await db.customer.create({
    data: { workspaceId, name: "Promise Customer", companyName: "Promise Customer", currentBalance: 450_000, creditDays: 30, creditLimit: 0, status: "ACTIVE" },
  });
  customerId = customer.id;
}, 60_000);

afterAll(async () => {
  if (!db) return;
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  if (otherWorkspaceId) await db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => undefined);
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  await db.$disconnect();
}, 60_000);

describe("collection promises", () => {
  it("creates one pending promise and replaces it safely for the same customer", async () => {
    const { listCollectionPromises, upsertCollectionPromise } = await import("@/lib/server/collection-promises");

    const firstId = await upsertCollectionPromise(context(), { customerId, amount: 200_000, promiseDate: "2026-09-20", note: "Cheque expected" });
    const secondId = await upsertCollectionPromise(context(), { customerId, amount: 150_000, promiseDate: "2026-09-21", note: "Bank transfer" });
    expect(secondId).toBe(firstId);

    const promises = await listCollectionPromises(workspaceId, { customerId, status: "PENDING", timeZone: "Asia/Karachi" });
    expect(promises).toHaveLength(1);
    expect(promises[0]).toMatchObject({ id: firstId, amount: 150_000, promiseDate: "2026-09-21", note: "Bank transfer", currentBalance: 450_000 });
  }, 60_000);

  it("rejects a promise above the authoritative customer balance", async () => {
    const { CollectionPromiseError, upsertCollectionPromise } = await import("@/lib/server/collection-promises");
    await expect(upsertCollectionPromise(context(), { customerId, amount: 450_001, promiseDate: "2026-09-22", note: "" })).rejects.toMatchObject({ code: "AMOUNT_EXCEEDS_BALANCE" } satisfies Partial<InstanceType<typeof CollectionPromiseError>>);
  }, 60_000);

  it("does not let another workspace resolve the promise", async () => {
    const { listCollectionPromises, updateCollectionPromiseStatus } = await import("@/lib/server/collection-promises");
    const [promise] = await listCollectionPromises(workspaceId, { customerId, status: "PENDING" });
    await expect(updateCollectionPromiseStatus({ workspaceId: otherWorkspaceId, userId, role: "OWNER" }, { promiseId: promise.id, status: "FULFILLED" })).rejects.toMatchObject({ code: "PROMISE_NOT_FOUND" });

    await updateCollectionPromiseStatus(context(), { promiseId: promise.id, status: "FULFILLED" });
    const [resolved] = await listCollectionPromises(workspaceId, { customerId });
    expect(resolved.status).toBe("FULFILLED");
  }, 60_000);
});
