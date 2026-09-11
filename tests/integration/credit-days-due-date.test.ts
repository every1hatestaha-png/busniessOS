import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "";
let userId = "";
let customerId = "";
let productId = "";

const runId = `credit-days-${Date.now()}`;
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  ({ db } = await import("@/lib/server/db"));

  const user = await db.user.create({ data: { clerkId: runId, email: `${runId}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `Credit days ${runId}`, members: { create: { userId, role: "OWNER" } } } });
  workspaceId = workspace.id;

  const customer = await db.customer.create({
    data: { workspaceId, name: "15 Day Customer", creditDays: 15, creditLimit: 0, status: "ACTIVE" },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: { workspaceId, name: "Credit Days Item", sku: `CD-${Date.now()}`, costPrice: 100, sellingPrice: 200, stockQuantity: 5, status: "ACTIVE" },
  });
  productId = product.id;

  const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
  await ensureDefaultAccounts(workspaceId);
}, 60_000);

afterAll(async () => {
  if (!db) return;
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  await db.$disconnect();
}, 60_000);

describe("customer credit days", () => {
  it("uses the customer's contractual credit period for invoice due date", async () => {
    const { createSale } = await import("@/lib/server/sales");
    const sale = await createSale(context(), {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: 200, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      cashBankAccountId: "",
      notes: "15-day due date regression",
      idempotencyKey: randomUUID(),
    });

    const [order, invoice] = await Promise.all([
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.invoice.findFirstOrThrow({ where: { workspaceId, salesOrderId: sale.id } }),
    ]);

    const dueInDays = Math.round((invoice.dueDate.getTime() - order.orderDate.getTime()) / 86_400_000);
    expect(dueInDays).toBe(15);
  }, 60_000);
});
