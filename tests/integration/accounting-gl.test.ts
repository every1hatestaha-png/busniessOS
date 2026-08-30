import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let supplierId = "";
let productId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function glTotals(sourceId: string) {
  const rows = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId } });
  return {
    count: rows.length,
    debit: rows.reduce((sum, row) => sum + Number(row.debit), 0),
    credit: rows.reduce((sum, row) => sum + Number(row.credit), 0),
  };
}

describe("accounting GL integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale, createCustomerReturn } = await import("@/lib/server/sales"));
    ({ createPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    const user = await db.user.create({ data: { clerkId: `gl-${runId}`, email: `gl-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `GL ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const [customer, supplier, product] = await Promise.all([
      db.customer.create({ data: { workspaceId, name: "GL Customer" } }),
      db.supplier.create({ data: { workspaceId, name: "GL Supplier" } }),
      db.product.create({ data: { workspaceId, name: "GL Product", sku: `gl-${runId}`, stockQuantity: 20, costPrice: 40, sellingPrice: 100 } }),
    ]);
    customerId = customer.id;
    supplierId = supplier.id;
    productId = product.id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.expense.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
    await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
    await db.paymentAllocation.deleteMany({ where: { workspaceId } });
    await db.payment.deleteMany({ where: { workspaceId } });
    await db.supplierReturn.deleteMany({ where: { workspaceId } });
    await db.customerReturn.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.creditNote.deleteMany({ where: { workspaceId } });
    await db.invoice.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.salesOrder.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("posts a balanced sale including COGS and cash receipt", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 2, unitPrice: 100, discount: 0 }], paidAmount: 50, orderDiscount: 0, notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(sale.id)).toEqual({ count: 6, debit: 330, credit: 330 });
  });

  it("posts a balanced standalone customer payment", async () => {
    const payment = await recordPayment(context(), { customerId, amount: 50, paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(payment.id)).toEqual({ count: 2, debit: 50, credit: 50 });
  });

  it("posts a balanced purchase including cash paid", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 30 }], paidAmount: 20, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(purchase.id)).toEqual({ count: 4, debit: 110, credit: 110 });
  });

  it("posts balanced supplier and customer returns", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 2, unitCost: 25 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const purchaseDetail = await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true } });
    const supplierReturn = await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: purchaseDetail.items[0].id, quantity: 1 }], reason: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(supplierReturn.id)).toEqual({ count: 2, debit: 25, credit: 25 });

    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 80, discount: 0 }], paidAmount: 0, orderDiscount: 0, notes: "", idempotencyKey: randomUUID() });
    const saleDetail = await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    const customerReturn = await createCustomerReturn(context(), { salesOrderId: sale.id, items: [{ itemId: saleDetail.items[0].id, quantity: 1 }], restock: true, reason: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(customerReturn.id)).toEqual({ count: 4, debit: 120, credit: 120 });
  });

  it("posts a balanced standalone supplier payment", async () => {
    const payment = await recordSupplierPayment(context(), supplierId, { amount: 20, allocations: [], paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(payment.id)).toEqual({ count: 2, debit: 20, credit: 20 });
  });
});
