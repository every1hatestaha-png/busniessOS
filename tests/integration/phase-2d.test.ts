import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = ""; let workspaceId = ""; let supplierId = ""; let customerId = ""; let productId = ""; let cashBankAccountId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Phase 2D financial operations", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale, createCustomerReturn } = await import("@/lib/server/sales"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ createPurchase, createGoodsReceipt, cancelPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    const user = await db.user.create({ data: { clerkId: `phase2d-${runId}`, email: `phase2d-${runId}@example.invalid` } }); userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Phase 2D ${runId}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    const [supplier, customer, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "2D supplier" } }),
      db.customer.create({ data: { workspaceId, name: "2D customer", creditLimit: 10000 } }),
      db.product.create({ data: { workspaceId, name: "2D product", sku: `2d-${runId}`, stockQuantity: 20, costPrice: 10, sellingPrice: 50 } }),
    ]);
    supplierId = supplier.id; customerId = customer.id; productId = product.id;
    await ensureDefaultAccounts(workspaceId);
    cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) {
      await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
      await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
      await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
      await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
      await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    }
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("allocates one customer payment across multiple invoices", async () => {
    const first = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 50, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const second = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 50, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const invoices = await db.invoice.findMany({ where: { salesOrderId: { in: [first.id, second.id] } }, orderBy: { createdAt: "asc" } });
    const key = randomUUID();
    const input = { customerId, cashBankAccountId, amount: 70, allocations: [{ invoiceId: invoices[0].id, amount: 50 }, { invoiceId: invoices[1].id, amount: 20 }], paymentDate: new Date(), method: "CASH" as const, reference: "", notes: "", idempotencyKey: key };
    const payment = await recordPayment(context(), input);
    expect((await recordPayment(context(), input)).id).toBe(payment.id);
    expect(await db.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoices[0].id } })).status).toBe("PAID");
    expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoices[1].id } })).paidAmount)).toBe(20);
  });

  it("cancels a received purchase with stock, payable, payment, ledger, and audit reversals", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 12 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const grn = await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 3, acceptedQuantity: 3, actualUnitCost: 12 }] });

    const productBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    await expect(cancelPurchase(context(), purchase.id, false)).rejects.toThrow("Explicitly confirm");
    await cancelPurchase(context(), purchase.id, true);
    const [order, product, audit, grnAfterCancel, glReversals] = await Promise.all([
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.auditLog.findFirst({ where: { workspaceId, entityId: purchase.id, action: "purchase.cancelled" } }),
      db.goodReceivedNote.findUnique({ where: { id: grn.id } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "REVERSAL", reversalOfId: { not: null } } }),
    ]);
    expect(order.status).toBe("CANCELLED");
    expect(product.stockQuantity.toNumber()).toBe(productBefore.stockQuantity.toNumber() - 3);
    expect(grnAfterCancel).not.toBeNull();
    expect(glReversals.length).toBeGreaterThan(0);
    expect(glReversals.reduce((sum, entry) => sum + Number(entry.debit), 0)).toBe(glReversals.reduce((sum, entry) => sum + Number(entry.credit), 0));
    expect(audit).not.toBeNull();
    await cancelPurchase(context(), purchase.id, true);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId, sourceType: "REVERSAL", reversalOfId: { not: null } } })).toBe(glReversals.length);
  });

  it("records customer and supplier returns with notes, stock, ledger, balances, and audit", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 2, unitPrice: 50, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const saleItem = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: sale.id } });
    const customerReturnInput = { salesOrderId: sale.id, items: [{ itemId: saleItem.id, quantity: 1 }], restock: true, reason: "Damaged", notes: "", idempotencyKey: randomUUID() };
    const customerReturn = await createCustomerReturn(context(), customerReturnInput);
    expect((await createCustomerReturn(context(), customerReturnInput)).id).toBe(customerReturn.id);
    expect(await db.creditNote.count({ where: { workspaceId, salesOrderId: sale.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { workspaceId, entityId: customerReturn.id, action: "customer_return.created" } })).toBe(1);

    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 4, unitCost: 11 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 11 }] });

    const purchaseItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const supplierReturnInput = { purchaseOrderId: purchase.id, items: [{ itemId: purchaseItem.id, quantity: 2 }], reason: "Wrong item", notes: "", idempotencyKey: randomUUID() };
    const supplierReturn = await createSupplierReturn(context(), supplierReturnInput);
    expect((await createSupplierReturn(context(), supplierReturnInput)).id).toBe(supplierReturn.id);
    expect(await db.debitNote.count({ where: { workspaceId, purchaseOrderId: purchase.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { workspaceId, entityId: supplierReturn.id, action: "supplier_return.created" } })).toBe(1);
  });

  it("allocates supplier payments to received purchases", async () => {
    const first = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 10 }], idempotencyKey: randomUUID() });
    const second = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 15 }], idempotencyKey: randomUUID() });

    const firstItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: first.id } });
    const secondItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: second.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: first.id, items: [{ purchaseOrderItemId: firstItem.id, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 10 }] });
    await createGoodsReceipt(context(), { purchaseOrderId: second.id, items: [{ purchaseOrderItemId: secondItem.id, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 15 }] });

    const key = randomUUID();
    const input = { amount: 20, cashBankAccountId, allocations: [{ purchaseOrderId: first.id, amount: 10 }, { purchaseOrderId: second.id, amount: 10 }], method: "CASH" as const, reference: "", notes: "", paymentDate: new Date(), idempotencyKey: key };
    const payment = await recordSupplierPayment(context(), supplierId, input);
    expect((await recordSupplierPayment(context(), supplierId, input)).id).toBe(payment.id);
    expect(await db.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: first.id } })).balanceAmount)).toBe(0);
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: second.id } })).balanceAmount)).toBe(5);
    await expect(cancelPurchase(context(), first.id, true)).rejects.toThrow("supplier payments have been allocated");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).isReversed).toBe(false);
    expect(await db.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
  });

  it("limits supplier payments to actual accepted GRN payable", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 10, unitCost: 100 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 8, acceptedQuantity: 6, actualUnitCost: 90 }] });
    const other = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 100 }], idempotencyKey: randomUUID() });
    const otherItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: other.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: other.id, items: [{ purchaseOrderItemId: otherItem.id, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 100 }] });

    await expect(recordSupplierPayment(context(), supplierId, { amount: 600, cashBankAccountId, allocations: [{ purchaseOrderId: purchase.id, amount: 600 }], method: "CASH", reference: "", notes: "", paymentDate: new Date(), idempotencyKey: randomUUID() })).rejects.toThrow("Payment exceeds purchase balance");

    const payment = await recordSupplierPayment(context(), supplierId, { amount: 540, cashBankAccountId, allocations: [{ purchaseOrderId: purchase.id, amount: 540 }], method: "CASH", reference: "", notes: "", paymentDate: new Date(), idempotencyKey: randomUUID() });
    expect(payment.id).toBeTruthy();
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } })).balanceAmount)).toBe(0);
  });

  it("limits supplier returns to accepted GRN quantity and actual cost", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 10, unitCost: 100 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 8, acceptedQuantity: 6, actualUnitCost: 90 }] });

    await expect(createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: poItem.id, quantity: 7 }], reason: "Too many", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Return quantity exceeds received quantity");

    const supplierReturn = await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: poItem.id, quantity: 2 }], reason: "Defective", notes: "", idempotencyKey: randomUUID() });
    const saved = await db.supplierReturn.findUniqueOrThrow({ where: { id: supplierReturn.id }, include: { items: true } });
    expect(Number(saved.totalAmount)).toBe(180);
    expect(Number(saved.items[0].unitCost)).toBe(90);
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } })).balanceAmount)).toBe(360);
  });

  it("blocks purchase cancellation after supplier returns", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 20 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 3, acceptedQuantity: 3, actualUnitCost: 20 }] });
    await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: poItem.id, quantity: 1 }], reason: "Returned", notes: "", idempotencyKey: randomUUID() });

    await expect(cancelPurchase(context(), purchase.id, true)).rejects.toThrow("supplier returns");
  });
});
