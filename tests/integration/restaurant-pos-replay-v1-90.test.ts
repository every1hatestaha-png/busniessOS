import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/auth", () => auth);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let db: typeof import("@/lib/server/db")["db"];
let workspaceId: string, menuItemId: string, userId: string;
beforeAll(async () => {
  ({ db } = await import("@/lib/server/db"));
  const run = randomUUID();
  const user = await db.user.create({ data: { clerkId: `replay-${run}`, email: `${run}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `Replay ${run}`, members: { create: { userId: user.id, role: "OWNER" } } } });
  workspaceId = workspace.id;
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
