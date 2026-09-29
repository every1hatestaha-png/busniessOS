import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teardownTestWorkspace } from "../finance-grade/helpers/db-helpers";

let db: typeof import("@/lib/server/db")["db"];
let sales: typeof import("@/lib/server/sales");
let purchases: typeof import("@/lib/server/purchases");
let workspaceId: string;
let userId: string;
let customerId: string;
let supplierId: string;
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("production hardening return integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    sales = await import("@/lib/server/sales");
    purchases = await import("@/lib/server/purchases");
    const token = randomUUID();
    userId = (await db.user.create({ data: { clerkId: `hardening-${token}`, email: `${token}@example.invalid` } })).id;
    workspaceId = (await db.workspace.create({ data: { name: `Hardening ${token}`, members: { create: { userId, role: "OWNER" } } } })).id;
    customerId = (await db.customer.create({ data: { workspaceId, name: "Rounding customer" } })).id;
    supplierId = (await db.supplier.create({ data: { workspaceId, name: "Return supplier" } })).id;
    await (await import("@/lib/server/accounting")).ensureDefaultAccounts(workspaceId);
  });
  afterAll(async () => {
    if (workspaceId) await teardownTestWorkspace(workspaceId, userId);
    await db?.$disconnect();
  });

  async function sale() {
    const product = await db.product.create({ data: { workspaceId, name: "Fractional", sku: randomUUID(), stockQuantity: 1, costPrice: 0.01, sellingPrice: 0.03 } });
    const order = await sales.createSale(context(), { customerId, items: [{ productId: product.id, quantity: 1, unitPrice: 0.03, discountPerUnit: 0 }], orderDiscount: 0, paidAmount: 0, idempotencyKey: randomUUID() });
    const item = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: order.id } });
    return { order, item, product };
  }

  it("fully returning fractional quantities refunds exactly the original line amount", async () => {
    const { order, item } = await sale();
    for (let i = 0; i < 2; i++) {
      await sales.createCustomerReturn(context(), { salesOrderId: order.id, items: [{ itemId: item.id, quantity: 0.5 }], restock: true, reason: "", notes: "", idempotencyKey: randomUUID() });
    }
    const result = await db.customerReturn.aggregate({ where: { salesOrderId: order.id }, _sum: { totalAmount: true } });
    expect(Number(result._sum.totalAmount)).toBe(0.03);
  });

  it("replays the same customer return but rejects a changed payload with that key", async () => {
    const { order, item } = await sale();
    const input = { salesOrderId: order.id, items: [{ itemId: item.id, quantity: 0.5 }], restock: true, reason: "", notes: "", idempotencyKey: randomUUID() };
    const original = await sales.createCustomerReturn(context(), input);
    expect((await sales.createCustomerReturn(context(), input)).id).toBe(original.id);
    await expect(sales.createCustomerReturn(context(), { ...input, restock: false })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(sales.createCustomerReturn(context(), { ...input, items: [{ itemId: item.id, quantity: 0.25 }] })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await db.customerReturn.count({ where: { salesOrderId: order.id } })).toBe(1);
  });

  it("reconciles partial-return tax, including a cancelled earlier partial return", async () => {
    const product = await db.product.create({ data: { workspaceId, name: "Tax rounding", sku: randomUUID(), stockQuantity: 1, costPrice: 0.01, sellingPrice: 0.17 } });
    const order = await sales.createSale(context(), { customerId, items: [{ productId: product.id, quantity: 1, unitPrice: 0.17, discountPerUnit: 0, taxRate: 18 }], orderDiscount: 0, paidAmount: 0, idempotencyKey: randomUUID() });
    const item = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: order.id } });
    const input = { salesOrderId: order.id, items: [{ itemId: item.id, quantity: 0.5 }], restock: false, reason: "", notes: "" };
    const first = await sales.createCustomerReturn(context(), { ...input, idempotencyKey: randomUUID() });
    await sales.createCustomerReturn(context(), { ...input, idempotencyKey: randomUUID() });
    const { cancelCustomerReturn } = await import("@/lib/server/customer-return-reversals");
    await cancelCustomerReturn(context(), first.id, "Correct earlier return");
    await sales.createCustomerReturn(context(), { ...input, idempotencyKey: randomUUID() });
    const active = await db.customerReturn.findMany({ where: { salesOrderId: order.id, creditNote: { is: { status: { not: "CANCELLED" } } } } });
    const tax = await db.generalLedgerEntry.aggregate({ where: { workspaceId, sourceType: "CUSTOMER_RETURN", sourceId: { in: active.map((entry) => entry.id) }, reversalOfId: null, account: { systemCode: "SALES_TAX_PAYABLE" } }, _sum: { debit: true } });
    expect(Number(tax._sum.debit)).toBe(Number(item.salesTaxAmount));
    expect(active.reduce((sum, entry) => sum + Number(entry.totalAmount), 0)).toBe(0.2);
  });

  it("includes unscoped supplier returns when checking a later receipt-specific return", async () => {
    const product = await db.product.create({ data: { workspaceId, name: "Mixed cost", sku: randomUUID(), stockQuantity: 100, costPrice: 100, sellingPrice: 200 } });
    const order = await purchases.createPurchase(context(), { supplierId, items: [{ productId: product.id, quantity: 20, unitCost: 100 }], idempotencyKey: randomUUID() });
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const first = await purchases.createGoodsReceipt(context(), { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 1 }], idempotencyKey: randomUUID() });
    await purchases.createGoodsReceipt(context(), { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 100 }], idempotencyKey: randomUUID() });
    const input = { purchaseOrderId: order.id, items: [{ itemId: item.id, quantity: 19 }], reason: "", notes: "", idempotencyKey: randomUUID() };
    const original = await purchases.createSupplierReturn(context(), input);
    expect((await purchases.createSupplierReturn(context(), input)).id).toBe(original.id);
    await expect(purchases.createSupplierReturn(context(), { ...input, items: [{ itemId: item.id, quantity: 18 }] })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const stock = (await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity;
    await expect(purchases.createSupplierReturn(context(), { ...input, goodReceivedNoteId: first.id, items: [{ itemId: item.id, quantity: 2 }], idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "INVALID_RETURN" });
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity.equals(stock)).toBe(true);
  });
});
