import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];

const runId = randomUUID();
let userId = ""; let workspaceId = ""; let supplierId = ""; let customerId = ""; let productId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Phase 2D financial operations", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale, createCustomerReturn } = await import("@/lib/server/sales"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ createPurchase, cancelPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    const user = await db.user.create({ data: { clerkId: `phase2d-${runId}`, email: `phase2d-${runId}@example.invalid` } }); userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Phase 2D ${runId}`, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    const [supplier, customer, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "2D supplier" } }),
      db.customer.create({ data: { workspaceId, name: "2D customer", creditLimit: 10000 } }),
      db.product.create({ data: { workspaceId, name: "2D product", sku: `2d-${runId}`, stockQuantity: 20, costPrice: 10, sellingPrice: 50 } }),
    ]);
    supplierId = supplier.id; customerId = customer.id; productId = product.id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) {
      await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
      await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
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
    const input = { customerId, amount: 70, allocations: [{ invoiceId: invoices[0].id, amount: 50 }, { invoiceId: invoices[1].id, amount: 20 }], paymentDate: new Date(), method: "CASH" as const, reference: "", notes: "", idempotencyKey: key };
    const payment = await recordPayment(context(), input);
    expect((await recordPayment(context(), input)).id).toBe(payment.id);
    expect(await db.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoices[0].id } })).status).toBe("PAID");
    expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoices[1].id } })).paidAmount)).toBe(20);
  });

  it("cancels a purchase with stock, payable, payment, ledger, and audit reversals", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 12 }], paidAmount: 10, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    await expect(cancelPurchase(context(), purchase.id, false)).rejects.toThrow("Explicitly confirm");
    await cancelPurchase(context(), purchase.id, true);
    const [order, product, supplier, reversal, audit] = await Promise.all([db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } }), db.product.findUniqueOrThrow({ where: { id: productId } }), db.supplier.findUniqueOrThrow({ where: { id: supplierId } }), db.payment.findFirst({ where: { workspaceId, supplierId, reversalOfId: { not: null } } }), db.auditLog.findFirst({ where: { workspaceId, entityId: purchase.id, action: "purchase.cancelled" } })]);
    expect(order.status).toBe("CANCELLED"); expect(product.stockQuantity).toBe(18); expect(Number(supplier.currentBalance)).toBe(0); expect(reversal).not.toBeNull(); expect(audit).not.toBeNull();
  });

  it("records customer and supplier returns with notes, stock, ledger, balances, and audit", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 2, unitPrice: 50, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const saleItem = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: sale.id } });
    const customerReturnInput = { salesOrderId: sale.id, items: [{ itemId: saleItem.id, quantity: 1 }], restock: true, reason: "Damaged", notes: "", idempotencyKey: randomUUID() };
    const customerReturn = await createCustomerReturn(context(), customerReturnInput);
    expect((await createCustomerReturn(context(), customerReturnInput)).id).toBe(customerReturn.id);
    expect(await db.creditNote.count({ where: { workspaceId, salesOrderId: sale.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { workspaceId, entityId: customerReturn.id, action: "customer_return.created" } })).toBe(1);

    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 4, unitCost: 11 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const purchaseItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const supplierReturnInput = { purchaseOrderId: purchase.id, items: [{ itemId: purchaseItem.id, quantity: 2 }], reason: "Wrong item", notes: "", idempotencyKey: randomUUID() };
    const supplierReturn = await createSupplierReturn(context(), supplierReturnInput);
    expect((await createSupplierReturn(context(), supplierReturnInput)).id).toBe(supplierReturn.id);
    expect(await db.debitNote.count({ where: { workspaceId, purchaseOrderId: purchase.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { workspaceId, entityId: supplierReturn.id, action: "supplier_return.created" } })).toBe(1);
  });

  it("allocates supplier payments to purchases", async () => {
    const first = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 10 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const second = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 15 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const key = randomUUID();
    const input = { amount: 20, allocations: [{ purchaseOrderId: first.id, amount: 10 }, { purchaseOrderId: second.id, amount: 10 }], method: "CASH" as const, reference: "", notes: "", paymentDate: new Date(), idempotencyKey: key };
    const payment = await recordSupplierPayment(context(), supplierId, input);
    expect((await recordSupplierPayment(context(), supplierId, input)).id).toBe(payment.id);
    expect(await db.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: first.id } })).balanceAmount)).toBe(0);
    expect(Number((await db.purchaseOrder.findUniqueOrThrow({ where: { id: second.id } })).balanceAmount)).toBe(5);
  });
});
