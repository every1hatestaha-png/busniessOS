import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let cancelSale: typeof import("@/lib/server/sales")["cancelSale"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
const runId = randomUUID(); let userId = ""; let workspaceId = ""; let supplierId = ""; let customerId = ""; let productId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Phase 2C transactions", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db")); ({ createPurchase } = await import("@/lib/server/purchases")); ({ createSale, cancelSale } = await import("@/lib/server/sales")); ({ recordPayment } = await import("@/lib/server/payments"));
    const user = await db.user.create({ data: { clerkId: `phase2c-${runId}`, email: `phase2c-${runId}@example.invalid` } }); userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Phase 2C ${runId}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    const [supplier, customer, product] = await Promise.all([db.supplier.create({ data: { workspaceId, name: "Test supplier" } }), db.customer.create({ data: { workspaceId, name: "Test customer" } }), db.product.create({ data: { workspaceId, name: "Snapshot product", sku: `P-${runId}`, stockQuantity: 2, costPrice: 10, sellingPrice: 30 } })]);
    supplierId = supplier.id; customerId = customer.id; productId = product.id;
  }, 30_000);
  afterAll(async () => { if (!db) return; if (workspaceId) { await db.salesOrder.deleteMany({ where: { workspaceId } }); await db.purchaseOrder.deleteMany({ where: { workspaceId } }); await db.workspace.delete({ where: { id: workspaceId } }); } if (userId) await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); }, 30_000);

  it("receives an idempotent purchase with snapshots, stock, payable, payment, ledger, and audit", async () => {
    const key = randomUUID(); const input = { supplierId, items: [{ productId, quantity: 3, unitCost: 12 }], paidAmount: 10, paymentMethod: "CASH" as const, notes: "test", idempotencyKey: key };
    const first = await createPurchase(context(), input); const repeated = await createPurchase(context(), input); expect(repeated.id).toBe(first.id);
    const [order, product, supplier, ledger, payments, audit] = await Promise.all([db.purchaseOrder.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } }), db.product.findUniqueOrThrow({ where: { id: productId } }), db.supplier.findUniqueOrThrow({ where: { id: supplierId } }), db.ledgerEntry.findMany({ where: { workspaceId, supplierId } }), db.payment.findMany({ where: { workspaceId, supplierId } }), db.auditLog.findFirst({ where: { workspaceId, entityId: first.id, action: "purchase.created" } })]);
    expect(Number(order.totalAmount)).toBe(36); expect(Number(order.balanceAmount)).toBe(26); expect(order.items[0]).toMatchObject({ productName: "Snapshot product", quantity: 3 }); expect(product.stockQuantity).toBe(5); expect(Number(supplier.currentBalance)).toBe(26); expect(ledger.map((entry) => entry.type)).toEqual(expect.arrayContaining(["PURCHASE", "PAYMENT_MADE"])); expect(payments).toHaveLength(1); expect(audit?.actorId).toBe(userId);
  });

  it("cancels a sale only without later payments and explicitly reverses its initial payment", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 30, discount: 0 }], orderDiscount: 0, paidAmount: 10, notes: "", idempotencyKey: randomUUID() });
    await expect(cancelSale(context(), sale.id, false)).rejects.toThrow("Explicitly confirm"); await cancelSale(context(), sale.id, true);
    const [order, invoice, product, customer, reversal, audit] = await Promise.all([db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }), db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } }), db.product.findUniqueOrThrow({ where: { id: productId } }), db.customer.findUniqueOrThrow({ where: { id: customerId } }), db.payment.findFirst({ where: { workspaceId, customerId, reversalOfId: { not: null } } }), db.auditLog.findFirst({ where: { workspaceId, entityId: sale.id, action: "sale.cancelled" } })]);
    expect(order.status).toBe("CANCELLED"); expect(invoice.status).toBe("CANCELLED"); expect(product.stockQuantity).toBe(5); expect(Number(customer.currentBalance)).toBe(0); expect(reversal).not.toBeNull(); expect(audit).not.toBeNull();
  });

  it("rejects cancellation when a later invoice payment exists", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 30, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() }); const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    await recordPayment(context(), { customerId, invoiceId: invoice.id, amount: 5, method: "CASH", paymentDate: new Date(), reference: "later", notes: "" }); await expect(cancelSale(context(), sale.id, false)).rejects.toThrow("later payments");
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("CONFIRMED");
  });
});
