import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let getPayablesAging: typeof import("@/lib/server/payables")["getPayablesAging"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
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

async function glLines(sourceId: string) {
  return db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId }, include: { account: true }, orderBy: [{ debit: "desc" }, { credit: "desc" }] });
}

function lineAmount(rows: Awaited<ReturnType<typeof glLines>>, account: string, side: "debit" | "credit") {
  return rows.filter((row) => row.account.systemCode === account).reduce((sum, row) => sum + Number(row[side]), 0);
}

async function accountBalance(systemCode: string, normal: "DEBIT" | "CREDIT") {
  const account = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: systemCode as never } } });
  const totals = await db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: account.id }, _sum: { debit: true, credit: true } });
  const debit = Number(totals._sum.debit ?? 0);
  const credit = Number(totals._sum.credit ?? 0);
  return normal === "DEBIT" ? debit - credit : credit - debit;
}

describe("accounting GL integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale, createCustomerReturn } = await import("@/lib/server/sales"));
    ({ createPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ getPayablesAging } = await import("@/lib/server/payables"));
    const user = await db.user.create({ data: { clerkId: `gl-${runId}`, email: `gl-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `GL ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    const otherWorkspace = await db.workspace.create({ data: { name: `GL Other ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
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
    const workspaceIds = [workspaceId, otherWorkspaceId].filter(Boolean);
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.expense.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.account.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: workspaceIds } } } });
    await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId: { in: workspaceIds } } } });
    await db.paymentAllocation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.payment.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.customerReturn.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.debitNote.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.creditNote.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.invoice.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: workspaceIds } } } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId: { in: workspaceIds } } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.salesOrder.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("posts a balanced sale including COGS and cash receipt", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 2, unitPrice: 100, discount: 0 }], paidAmount: 50, orderDiscount: 0, notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(sale.id)).toEqual({ count: 6, debit: 330, credit: 330 });
    const rows = await glLines(sale.id);
    expect(lineAmount(rows, "ACCOUNTS_RECEIVABLE", "debit")).toBe(200);
    expect(lineAmount(rows, "SALES_REVENUE", "credit")).toBe(200);
    expect(lineAmount(rows, "COST_OF_GOODS_SOLD", "debit")).toBe(80);
    expect(lineAmount(rows, "INVENTORY", "credit")).toBe(80);
    expect(lineAmount(rows, "CASH_IN_HAND", "debit")).toBe(50);
    expect(lineAmount(rows, "ACCOUNTS_RECEIVABLE", "credit")).toBe(50);
  });

  it("posts a balanced standalone customer payment", async () => {
    const payment = await recordPayment(context(), { customerId, amount: 50, paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(payment.id)).toEqual({ count: 2, debit: 50, credit: 50 });
    const rows = await glLines(payment.id);
    expect(lineAmount(rows, "CASH_IN_HAND", "debit")).toBe(50);
    expect(lineAmount(rows, "ACCOUNTS_RECEIVABLE", "credit")).toBe(50);
  });

  it("posts a balanced purchase including cash paid", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 3, unitCost: 30 }], paidAmount: 20, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(purchase.id)).toEqual({ count: 4, debit: 110, credit: 110 });
    const rows = await glLines(purchase.id);
    expect(lineAmount(rows, "INVENTORY", "debit")).toBe(90);
    expect(lineAmount(rows, "ACCOUNTS_PAYABLE", "credit")).toBe(90);
    expect(lineAmount(rows, "ACCOUNTS_PAYABLE", "debit")).toBe(20);
    expect(lineAmount(rows, "CASH_IN_HAND", "credit")).toBe(20);
  });

  it("posts balanced supplier and customer returns", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 2, unitCost: 25 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const purchaseDetail = await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true } });
    const supplierReturn = await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: purchaseDetail.items[0].id, quantity: 1 }], reason: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(supplierReturn.id)).toEqual({ count: 2, debit: 25, credit: 25 });

    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 80, discount: 0 }], paidAmount: 0, orderDiscount: 0, notes: "", idempotencyKey: randomUUID() });
    const saleDetail = await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    const customerReturn = await createCustomerReturn(context(), { salesOrderId: sale.id, items: [{ itemId: saleDetail.items[0].id, quantity: 1 }], restock: true, reason: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(customerReturn.id)).toEqual({ count: 4, debit: 105, credit: 105 });
    const rows = await glLines(customerReturn.id);
    expect(lineAmount(rows, "SALES_REVENUE", "debit")).toBe(80);
    expect(lineAmount(rows, "ACCOUNTS_RECEIVABLE", "credit")).toBe(80);
    expect(lineAmount(rows, "INVENTORY", "debit")).toBe(25);
    expect(lineAmount(rows, "COST_OF_GOODS_SOLD", "credit")).toBe(25);
  });

  it("posts a balanced standalone supplier payment", async () => {
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 1, unitCost: 20 }], paidAmount: 0, paymentMethod: "CASH", notes: "", idempotencyKey: randomUUID() });
    const payment = await recordSupplierPayment(context(), supplierId, { amount: 20, allocations: [{ purchaseOrderId: purchase.id, amount: 20 }], paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() });
    expect(await glTotals(payment.id)).toEqual({ count: 2, debit: 20, credit: 20 });
    const rows = await glLines(payment.id);
    expect(lineAmount(rows, "ACCOUNTS_PAYABLE", "debit")).toBe(20);
    expect(lineAmount(rows, "CASH_IN_HAND", "credit")).toBe(20);
  });

  it("does not duplicate GL entries on idempotent sale retry", async () => {
    const idempotencyKey = randomUUID();
    const input = { customerId, items: [{ productId, quantity: 1, unitPrice: 60, discount: 0 }], paidAmount: 0, orderDiscount: 0, notes: "", idempotencyKey };
    const first = await createSale(context(), input);
    const second = await createSale(context(), input);
    expect(second.id).toBe(first.id);
    expect(await glTotals(first.id)).toEqual({ count: 4, debit: 80, credit: 80 });
  });

  it("keeps workspace isolation and reconciles operational balances with GL", async () => {
    const otherCustomer = await db.customer.create({ data: { workspaceId: otherWorkspaceId, name: "Other Customer" } });
    const otherProduct = await db.product.create({ data: { workspaceId: otherWorkspaceId, name: "Other Product", sku: `gl-other-${runId}`, stockQuantity: 5, costPrice: 10, sellingPrice: 30 } });
    await createSale({ workspaceId: otherWorkspaceId, userId, role: "OWNER" }, { customerId: otherCustomer.id, items: [{ productId: otherProduct.id, quantity: 1, unitPrice: 30, discount: 0 }], paidAmount: 0, orderDiscount: 0, notes: "", idempotencyKey: randomUUID() });
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBeGreaterThan(0);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId, account: { workspaceId: otherWorkspaceId } } })).toBe(0);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(await accountBalance("ACCOUNTS_RECEIVABLE", "DEBIT")).toBe(Number(customer.currentBalance));
    expect(await accountBalance("ACCOUNTS_PAYABLE", "CREDIT")).toBe(Number(supplier.currentBalance));

    const customerKhata = await db.ledgerEntry.aggregate({ where: { workspaceId, customerId }, _sum: { debit: true, credit: true } });
    const supplierKhata = await db.ledgerEntry.aggregate({ where: { workspaceId, supplierId }, _sum: { debit: true, credit: true } });
    expect(Number(customerKhata._sum.debit ?? 0) - Number(customerKhata._sum.credit ?? 0)).toBe(Number(customer.currentBalance));
    expect(Number(supplierKhata._sum.credit ?? 0) - Number(supplierKhata._sum.debit ?? 0)).toBe(Number(supplier.currentBalance));

    const payableAging = await getPayablesAging(workspaceId, { asOf: new Date(), timeZone: "Asia/Karachi" });
    expect(payableAging.totalOutstanding).toBe(Number(supplier.currentBalance));
  });
});
