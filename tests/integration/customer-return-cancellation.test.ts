import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let cancelSale: typeof import("@/lib/server/sales")["cancelSale"];
let cancelCustomerReturn: typeof import("@/lib/server/customer-return-reversals")["cancelCustomerReturn"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let productId = "";

describe("customer return cancellation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ createSale, createCustomerReturn, cancelSale } = await import("@/lib/server/sales"));
    ({ cancelCustomerReturn } = await import("@/lib/server/customer-return-reversals"));

    const user = await db.user.create({ data: { clerkId: `customer-return-cancel-${runId}`, email: `customer-return-cancel-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Customer return cancel ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);
    const customer = await db.customer.create({ data: { workspaceId, name: "Return Customer", creditLimit: 1000 } });
    customerId = customer.id;
    const product = await db.product.create({ data: { workspaceId, name: "Return Lifecycle Product", sku: `CR-${runId}`, stockQuantity: 10, costPrice: 10, sellingPrice: 20 } });
    productId = product.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("cancels an unapplied return, frees its quantity for a new return, and no longer blocks sale cancellation once all returns are cancelled", async () => {
    const sale = await createSale(
      { workspaceId, role: "OWNER", userId },
      {
        customerId,
        items: [{ productId, quantity: 4, unitPrice: 20, discountPerUnit: 0 }],
        orderDiscount: 0,
        paidAmount: 0,
        notes: "Customer return cancellation lifecycle",
        idempotencyKey: randomUUID(),
      },
    );
    const saleRow = await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    const itemId = saleRow.items[0].id;

    const firstReturn = await createCustomerReturn(
      { workspaceId, role: "OWNER", userId },
      { salesOrderId: sale.id, items: [{ itemId, quantity: 2 }], restock: true, reason: "First return", notes: "", idempotencyKey: randomUUID() },
    );
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(8);
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).currentBalance)).toBe(40);

    const cancelledFirst = await cancelCustomerReturn({ workspaceId, role: "OWNER", userId }, firstReturn.id, "Return recorded by mistake");
    expect(cancelledFirst.alreadyCancelled).toBe(false);
    const firstCredit = await db.creditNote.findUniqueOrThrow({ where: { customerReturnId: firstReturn.id } });
    expect(firstCredit.status).toBe("CANCELLED");
    expect(Number(firstCredit.remainingAmount)).toBe(0);
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(6);
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).currentBalance)).toBe(80);

    // The cancelled return must not consume the cumulative return allowance.
    const secondReturn = await createCustomerReturn(
      { workspaceId, role: "OWNER", userId },
      { salesOrderId: sale.id, items: [{ itemId, quantity: 4 }], restock: true, reason: "Actual full return", notes: "", idempotencyKey: randomUUID() },
    );
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(10);
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).currentBalance)).toBe(0);

    await cancelCustomerReturn({ workspaceId, role: "OWNER", userId }, secondReturn.id, "Customer kept the goods");
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity)).toBe(6);
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).currentBalance)).toBe(80);

    // Cancelled customer returns must no longer block the parent sale cancellation.
    await expect(cancelSale({ workspaceId, role: "OWNER", userId }, sale.id, false)).resolves.toEqual({ id: sale.id });
    const [finalSale, finalProduct, finalCustomer] = await Promise.all([
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ]);
    expect(finalSale.status).toBe("CANCELLED");
    expect(Number(finalProduct.stockQuantity)).toBe(10);
    expect(Number(finalCustomer.currentBalance)).toBe(0);

    const repeated = await cancelCustomerReturn({ workspaceId, role: "OWNER", userId }, firstReturn.id, "Return recorded by mistake");
    expect(repeated).toEqual({ id: firstReturn.id, alreadyCancelled: true });

    const returnGl = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: firstReturn.id } });
    const reversals = await db.generalLedgerEntry.findMany({ where: { workspaceId, reversalOfId: { in: returnGl.filter((row) => !row.reversalOfId).map((row) => row.id) } } });
    expect(reversals.length).toBeGreaterThan(0);
  }, 60_000);
});
