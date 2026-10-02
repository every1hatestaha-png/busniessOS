import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

// Identity transport is stubbed. Entitlement, Restaurant writes and snapshots
// use real isolated PostgreSQL; this is not provider-authentication acceptance.
const auth = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/auth", () => auth);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let db: typeof import("@/lib/server/db")["db"];
let workspaceId: string, userId: string, menuItemId: string;
beforeAll(async () => {
  ({ db } = await import("@/lib/server/db"));
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `rc91-${run}`, email: `${run}@example.invalid` } }); userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `RC91 access ${run}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
  await db.$executeRaw`INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled,config) VALUES (${workspaceId}::uuid,'restaurant',true,'{}'::jsonb)`;
  auth.requireWorkspace.mockResolvedValue({ workspaceId, role: "OWNER", user });
  const service = await import("@/lib/server/restaurant-workspace");
  const context = { workspaceId, userId, role: "OWNER" as const };
  const category = await service.createRestaurantMenuCategory(context, { name: "Synthetic meals" });
  menuItemId = (await service.createRestaurantMenuItem(context, { categoryId: category.id, name: "Synthetic meal", price: 100 })).id;
  const { getWorkspaceAccess } = await import("@/lib/server/subscriptions");
  expect((await getWorkspaceAccess(workspaceId)).allowed).toBe(true);
});
afterAll(async () => { if (db) await db.$disconnect(); });
function form(key = randomUUID()) {
  const f = new FormData(); f.set("formWorkspaceId",workspaceId); f.set("orderRequestId",key);
  f.set("fulfillmentType","TAKEAWAY"); f.set("itemsJson",JSON.stringify([{ menuItemId, quantity: 1 }])); return f;
}
async function setAccess(status: string) {
  await db.$executeRaw`UPDATE workspace_subscriptions SET status=${status}, "trialEndsAt"=CURRENT_TIMESTAMP-interval '1 day',"currentPeriodEnd"=NULL,"overrideUntil"=NULL,"graceEndsAt"=NULL WHERE "workspaceId"=${workspaceId}`;
}
async function evidence() {
  const orders = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM restaurant_orders WHERE "workspaceId"=${workspaceId}::uuid`;
  const tickets = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM kitchen_tickets WHERE "workspaceId"=${workspaceId}::uuid`;
  return { orders: Number(orders[0].count), tickets: Number(tickets[0].count), audit: await db.auditLog.count({ where: { workspaceId } }), ledger: await db.generalLedgerEntry.count({ where: { workspaceId } }), inventory: await db.inventoryTransaction.count({ where: { workspaceId } }) };
}
it.each(["SUSPENDED","EXPIRED"])("a stale POS submission cannot write into a %s workspace", async status => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  await setAccess(status); const before = await evidence();
  try {
    const result = await createPosOrderAction({ status: "idle", message: "" },form());
    expect(result.status).toBe("error"); expect(result.message).toMatch(/suspended|expired/i);
    expect(await evidence()).toEqual(before);
  } finally { await setAccess("ACTIVE"); }
});
it("a successful POS replay rechecks newly suspended access while historical print remains readable", async () => {
  const { createPosOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
  const f = form(); expect((await createPosOrderAction({ status: "idle", message: "" },f)).status).toBe("success");
  const order = (await db.$queryRaw<Array<{ id: string; orderNumber: string }>>`SELECT id,"orderNumber" FROM restaurant_orders WHERE "workspaceId"=${workspaceId}::uuid AND "externalReference"=${`pos:${f.get("orderRequestId")}`}`)[0];
  const before = await evidence(); await setAccess("SUSPENDED");
  try {
    expect((await createPosOrderAction({ status: "idle", message: "" },f)).status).toBe("error");
    const { getRestaurantPrintDocument } = await import("@/lib/server/restaurant-print");
    expect(await getRestaurantPrintDocument(workspaceId,order.id)).toMatchObject({ orderNumber: order.orderNumber, total: 100 });
    expect(await evidence()).toEqual(before);
  } finally { await setAccess("ACTIVE"); }
});
