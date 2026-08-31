import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let getPayablesAging: typeof import("@/lib/server/payables")["getPayablesAging"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let supplierA = "";
let supplierB = "";
let productId = "";
let cashBankAccountId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

const AS_OF = new Date("2026-08-29T12:00:00Z");
const TZ = "Asia/Karachi";

function asOfPlusDays(offset: number): Date {
  const d = new Date(AS_OF);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

async function createPOAndReceive(ctx: { workspaceId: string; userId: string; role: "OWNER" }, supplierId: string, productId: string, quantity: number, unitCost: number) {
  const order = await createPurchase(ctx, { supplierId, items: [{ productId, quantity, unitCost }], idempotencyKey: randomUUID() });
  const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  await createGoodsReceipt(ctx, { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: quantity, acceptedQuantity: quantity, actualUnitCost: unitCost }] });
  return order;
}

describe("payable aging service", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, createGoodsReceipt, cancelPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ getPayablesAging } = await import("@/lib/server/payables"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    const user = await db.user.create({ data: { clerkId: `aging-${runId}`, email: `aging-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Aging ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const other = await db.workspace.create({ data: { name: `Other ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    otherWorkspaceId = other.id;
    const [a, b, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Supplier A" } }),
      db.supplier.create({ data: { workspaceId, name: "Supplier B" } }),
      db.product.create({ data: { workspaceId, name: "Aging product", sku: `aging-${runId}`, stockQuantity: 500, costPrice: 10, sellingPrice: 50 } }),
    ]);
    supplierA = a.id; supplierB = b.id; productId = product.id;
    await ensureDefaultAccounts(workspaceId);
    cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  async function backdate(purchaseId: string, daysAgo: number) {
    const date = asOfPlusDays(-daysAgo);
    await Promise.all([
      db.purchaseOrder.update({ where: { id: purchaseId }, data: { orderDate: date } }),
      db.goodReceivedNote.updateMany({ where: { purchaseOrderId: purchaseId }, data: { receiptDate: date } }),
    ]);
  }

  it("ages only the remaining outstanding amount after a partial payment", async () => {
    const purchase = await createPOAndReceive(context(), supplierA, productId, 1, 500);
    await backdate(purchase.id, 48);
    await recordSupplierPayment(context(), supplierA, { amount: 300, cashBankAccountId, allocations: [{ purchaseOrderId: purchase.id, amount: 300 }], method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID(), paymentDate: asOfPlusDays(-1) });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierA)!;
    const item = supplier.items.find((entry) => entry.purchaseId === purchase.id)!;
    expect(item.originalAmount).toBe(500);
    expect(item.outstandingAmount).toBe(200);
    expect(item.bucket).toBe("46-60");
    expect(item.ageDays).toBe(48);
    expect(report.buckets["46-60"]).toBe(200);
  });

  it("drops a fully-paid purchase from the active aging report", async () => {
    const purchase = await createPOAndReceive(context(), supplierA, productId, 1, 100);
    await backdate(purchase.id, 61);
    await recordSupplierPayment(context(), supplierA, { amount: 100, cashBankAccountId, allocations: [{ purchaseOrderId: purchase.id, amount: 100 }], method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID(), paymentDate: asOfPlusDays(-1) });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierA)!;
    expect(supplier.items.some((entry) => entry.purchaseId === purchase.id)).toBe(false);
    const order = await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(order.status).not.toBe("CANCELLED");
    expect(Number(order.balanceAmount)).toBe(0);
  });

  it("aggregates multiple purchases for the same supplier across buckets", async () => {
    const recent = await createPOAndReceive(context(), supplierB, productId, 1, 50);
    const old = await createPOAndReceive(context(), supplierB, productId, 1, 120);
    await backdate(recent.id, 5);
    await backdate(old.id, 75);
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierB)!;
    expect(supplier.totalOutstanding).toBe(170);
    expect(supplier.buckets["1-30"]).toBe(50);
    expect(supplier.buckets["61+"]).toBe(120);
    expect(supplier.oldestAgeDays).toBe(75);
    expect(report.totalOutstanding).toBeGreaterThanOrEqual(170);
  });

  it("reflects supplier returns as a reduction to outstanding", async () => {
    const purchase = await createPOAndReceive(context(), supplierA, productId, 4, 25);
    await backdate(purchase.id, 20);
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const supplierReturn = await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: item.id, quantity: 1 }], reason: "Defective", notes: "", idempotencyKey: randomUUID() });
    await db.supplierReturn.update({ where: { id: supplierReturn.id }, data: { date: asOfPlusDays(-1) } });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierA)!;
    const entry = supplier.items.find((row) => row.purchaseId === purchase.id);
    expect(entry).toBeDefined();
    expect(entry!.originalAmount).toBe(100);
    expect(entry!.outstandingAmount).toBe(75);
  });

  it("does not keep a cancelled purchase as a payable", async () => {
    const purchase = await createPOAndReceive(context(), supplierB, productId, 2, 60);
    await backdate(purchase.id, 10);
    await cancelPurchase(context(), purchase.id, true);
    await db.purchaseOrder.update({ where: { id: purchase.id }, data: { cancelledAt: asOfPlusDays(-1) } });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    for (const supplier of report.suppliers) {
      expect(supplier.items.some((entry) => entry.purchaseId === purchase.id)).toBe(false);
    }
  });

  it("does not leak data across workspaces", async () => {
    const other = await db.purchaseOrder.create({ data: { workspaceId: otherWorkspaceId, supplierId: supplierA, orderNumber: `LEAK-${runId}`, status: "RECEIVED", totalAmount: 9999, paidAmount: 0, balanceAmount: 9999, orderDate: asOfPlusDays(0) } });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    for (const supplier of report.suppliers) {
      expect(supplier.totalOutstanding).not.toBe(9999);
    }
    expect(Object.values(report.buckets).some((value) => value === 9999)).toBe(false);
    await db.purchaseOrder.delete({ where: { id: other.id } });
  });

  it("creates zero-dated / current purchases without misclassification", async () => {
    const purchase = await createPOAndReceive(context(), supplierB, productId, 1, 30);
    const report = await getPayablesAging(workspaceId, { asOf: new Date(), timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierB)!;
    const entry = supplier.items.find((row) => row.purchaseId === purchase.id);
    if (entry) {
      expect(entry.ageDays).toBeGreaterThanOrEqual(0);
      expect(["current", "1-30"]).toContain(entry.bucket);
    }
  });

  it("does not age ordered POs before GRN creates payable liability", async () => {
    const order = await createPurchase(context(), { supplierId: supplierA, items: [{ productId, quantity: 1, unitCost: 999 }], idempotencyKey: randomUUID() });
    await backdate(order.id, 75);

    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });

    expect(report.suppliers.flatMap((supplier) => supplier.items).some((item) => item.purchaseId === order.id)).toBe(false);
  });

  it("ages actual accepted GRN value instead of ordered PO total", async () => {
    const order = await createPurchase(context(), { supplierId: supplierA, items: [{ productId, quantity: 10, unitCost: 100 }], idempotencyKey: randomUUID() });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    await createGoodsReceipt(context(), { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 8, acceptedQuantity: 6, actualUnitCost: 90 }] });
    await backdate(order.id, 35);

    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const item = report.suppliers.flatMap((supplier) => supplier.items).find((entry) => entry.purchaseId === order.id);

    expect(item).toBeDefined();
    expect(item!.originalAmount).toBe(540);
    expect(item!.outstandingAmount).toBe(540);
  });
});
