import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let cancelSale: typeof import("@/lib/server/sales")["cancelSale"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
const runId = randomUUID(); let userId = ""; let workspaceId = ""; let supplierId = ""; let customerId = ""; let productId = ""; let cashBankAccountId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Phase 2C transactions", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db")); ({ createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases")); ({ createSale, cancelSale } = await import("@/lib/server/sales")); ({ recordPayment } = await import("@/lib/server/payments")); ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    const user = await db.user.create({ data: { clerkId: `phase2c-${runId}`, email: `phase2c-${runId}@example.invalid` } }); userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Phase 2C ${runId}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    const [supplier, customer, product] = await Promise.all([db.supplier.create({ data: { workspaceId, name: "Test supplier" } }), db.customer.create({ data: { workspaceId, name: "Test customer" } }), db.product.create({ data: { workspaceId, name: "Snapshot product", sku: `P-${runId}`, stockQuantity: 2, costPrice: 10, sellingPrice: 30 } })]);
    supplierId = supplier.id; customerId = customer.id; productId = product.id;
    await ensureDefaultAccounts(workspaceId);
    cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true }, select: { id: true } })).id;
  }, 30_000);
  afterAll(async () => { if (!db) return; if (workspaceId) { await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } }); await db.goodReceivedNote.deleteMany({ where: { workspaceId } }); await db.payment.deleteMany({ where: { workspaceId } }); await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } }); await db.salesOrder.deleteMany({ where: { workspaceId } }); await db.generalLedgerEntry.deleteMany({ where: { workspaceId } }); await db.ledgerEntry.deleteMany({ where: { workspaceId } }); await db.inventoryTransaction.deleteMany({ where: { workspaceId } }); await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } }); await db.purchaseOrder.deleteMany({ where: { workspaceId } }); await db.workspace.delete({ where: { id: workspaceId } }); } if (userId) await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); }, 30_000);

  it("receives an idempotent PO then GRN with stock, payable, ledger, and audit", async () => {
    const key = randomUUID();
    const order = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 12 }], idempotencyKey: key });
    const repeated = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 12 }], idempotencyKey: key });
    expect(repeated.id).toBe(order.id);

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 3, acceptedQuantity: 3, actualUnitCost: 12 }] });

    const [orderRow, product, supplier, ledger, audit] = await Promise.all([
      db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.ledgerEntry.findMany({ where: { workspaceId, supplierId } }),
      db.auditLog.findFirst({ where: { workspaceId, entityId: order.id, action: "purchase.created" } }),
    ]);
    expect(Number(orderRow.totalAmount)).toBe(36);
    expect(Number(orderRow.balanceAmount)).toBe(36);
    expect(orderRow.items[0].productName).toBe("Snapshot product");
    expect(orderRow.items[0].quantity.toNumber()).toBe(3);
    expect(product.stockQuantity.toNumber()).toBe(5);
    expect(Number(supplier.currentBalance)).toBe(36);
    expect(ledger.map((entry) => entry.type)).toEqual(expect.arrayContaining(["GOODS_RECEIVED"]));
    expect(audit?.actorId).toBe(userId);
  });

  it("cancels a sale only without later payments and explicitly reverses its initial payment", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 30, discount: 0 }], orderDiscount: 0, paidAmount: 10, cashBankAccountId, notes: "", idempotencyKey: randomUUID() });
    await expect(cancelSale(context(), sale.id, false)).rejects.toThrow("Explicitly confirm"); await cancelSale(context(), sale.id, true);
    const [order, invoice, product, customer, reversal, audit, glReversals] = await Promise.all([db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }), db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } }), db.product.findUniqueOrThrow({ where: { id: productId } }), db.customer.findUniqueOrThrow({ where: { id: customerId } }), db.payment.findFirst({ where: { workspaceId, customerId, reversalOfId: { not: null } } }), db.auditLog.findFirst({ where: { workspaceId, entityId: sale.id, action: "sale.cancelled" } }), db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "REVERSAL", sourceId: sale.id, reversalOfId: { not: null } } })]);
    expect(order.status).toBe("CANCELLED"); expect(invoice.status).toBe("CANCELLED"); expect(product.stockQuantity.toNumber()).toBe(5); expect(Number(customer.currentBalance)).toBe(0); expect(reversal).not.toBeNull(); expect(audit).not.toBeNull();
    expect(glReversals.length).toBeGreaterThan(0);
    expect(glReversals.reduce((sum, entry) => sum + Number(entry.debit), 0)).toBe(glReversals.reduce((sum, entry) => sum + Number(entry.credit), 0));
    await cancelSale(context(), sale.id, true);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId, sourceType: "REVERSAL", sourceId: sale.id, reversalOfId: { not: null } } })).toBe(glReversals.length);
  });

  it("rejects cancellation when a later invoice payment exists", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 30, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() }); const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    await recordPayment(context(), { customerId, invoiceId: invoice.id, cashBankAccountId, amount: 5, method: "CASH", paymentDate: new Date(), reference: "later", notes: "" }); await expect(cancelSale(context(), sale.id, false)).rejects.toThrow("later payments");
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("CONFIRMED");
  });
});
