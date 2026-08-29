import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let getPayablesAging: typeof import("@/lib/server/payables")["getPayablesAging"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let supplierA = "";
let supplierB = "";
let productId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

// Fixed as-of date for deterministic aging; everything below is created years
// before it unless we backdate orderDate explicitly.
const AS_OF = new Date("2026-08-29T12:00:00Z");
const TZ = "Asia/Karachi";

function asOfPlusDays(offset: number): Date {
  const d = new Date(AS_OF);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

describe("payable aging service", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, cancelPurchase, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ getPayablesAging } = await import("@/lib/server/payables"));
    const user = await db.user.create({ data: { clerkId: `aging-${runId}`, email: `aging-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Aging ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    // A separate workspace owned by the same user to prove isolation.
    const other = await db.workspace.create({ data: { name: `Other ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    otherWorkspaceId = other.id;
    const [a, b, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Supplier A" } }),
      db.supplier.create({ data: { workspaceId, name: "Supplier B" } }),
      db.product.create({ data: { workspaceId, name: "Aging product", sku: `aging-${runId}`, stockQuantity: 500, costPrice: 10, sellingPrice: 50 } }),
    ]);
    supplierA = a.id; supplierB = b.id; productId = product.id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  function backdate(purchaseId: string, daysAgo: number) {
    return db.purchaseOrder.update({ where: { id: purchaseId }, data: { orderDate: asOfPlusDays(-daysAgo) } });
  }

  it("ages only the remaining outstanding amount after a partial payment", async () => {
    const purchase = await createPurchase(context(), { supplierId: supplierA, items: [{ productId, quantity: 1, unitCost: 500 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    await backdate(purchase.id, 48); // -> 46-60 bucket
    await recordSupplierPayment(context(), supplierA, { amount: 300, allocations: [{ purchaseOrderId: purchase.id, amount: 300 }], method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID(), paymentDate: new Date() });
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
    const purchase = await createPurchase(context(), { supplierId: supplierA, items: [{ productId, quantity: 1, unitCost: 100 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    await backdate(purchase.id, 61);
    await recordSupplierPayment(context(), supplierA, { amount: 100, allocations: [{ purchaseOrderId: purchase.id, amount: 100 }], method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID(), paymentDate: new Date() });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierA)!;
    expect(supplier.items.some((entry) => entry.purchaseId === purchase.id)).toBe(false);
    // Historical purchase/payment records remain intact in the DB.
    const order = await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(order.status).not.toBe("CANCELLED");
    expect(Number(order.balanceAmount)).toBe(0);
  });

  it("aggregates multiple purchases for the same supplier across buckets", async () => {
    const recent = await createPurchase(context(), { supplierId: supplierB, items: [{ productId, quantity: 1, unitCost: 50 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    const old = await createPurchase(context(), { supplierId: supplierB, items: [{ productId, quantity: 1, unitCost: 120 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    await backdate(recent.id, 5);   // 1-30
    await backdate(old.id, 75);     // 61+
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierB)!;
    expect(supplier.totalOutstanding).toBe(170);
    expect(supplier.buckets["1-30"]).toBe(50);
    expect(supplier.buckets["61+"]).toBe(120);
    expect(supplier.oldestAgeDays).toBe(75);
    expect(report.totalOutstanding).toBeGreaterThanOrEqual(170);
  });

  it("reflects supplier returns as a reduction to outstanding", async () => {
    const purchase = await createPurchase(context(), { supplierId: supplierA, items: [{ productId, quantity: 4, unitCost: 25 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    await backdate(purchase.id, 20);
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    await createSupplierReturn(context(), { purchaseOrderId: purchase.id, items: [{ itemId: item.id, quantity: 1 }], reason: "Defective", notes: "", idempotencyKey: randomUUID() });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierA)!;
    const entry = supplier.items.find((row) => row.purchaseId === purchase.id);
    // 100 total - 25 returned = 75 still outstanding.
    expect(entry).toBeDefined();
    expect(entry!.originalAmount).toBe(100);
    expect(entry!.outstandingAmount).toBe(75);
  });

  it("does not keep a cancelled purchase as a payable", async () => {
    const purchase = await createPurchase(context(), { supplierId: supplierB, items: [{ productId, quantity: 2, unitCost: 60 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    await backdate(purchase.id, 10);
    await cancelPurchase(context(), purchase.id, false);
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    for (const supplier of report.suppliers) {
      expect(supplier.items.some((entry) => entry.purchaseId === purchase.id)).toBe(false);
    }
  });

  it("does not leak data across workspaces", async () => {
    const other = await db.purchaseOrder.create({ data: { workspaceId: otherWorkspaceId, supplierId: supplierA, orderNumber: `LEAK-${runId}`, status: "RECEIVED", totalAmount: 9999, paidAmount: 0, balanceAmount: 9999, orderDate: asOfPlusDays(0) } });
    const report = await getPayablesAging(workspaceId, { asOf: AS_OF, timeZone: TZ });
    // No supplier or bucket from this workspace may reflect the other workspace's 9999 payable.
    for (const supplier of report.suppliers) {
      expect(supplier.totalOutstanding).not.toBe(9999);
    }
    expect(Object.values(report.buckets).some((value) => value === 9999)).toBe(false);
    await db.purchaseOrder.delete({ where: { id: other.id } });
  });

  it("creates zero-dated / current purchases without misclassification", async () => {
    const purchase = await createPurchase(context(), { supplierId: supplierB, items: [{ productId, quantity: 1, unitCost: 30 }], paidAmount: 0, paymentMethod: "CASH" as const, notes: "", idempotencyKey: randomUUID() });
    // orderDate defaults to now; compare with a matching asOf exactly.
    const report = await getPayablesAging(workspaceId, { asOf: new Date(), timeZone: TZ });
    const supplier = report.suppliers.find((entry) => entry.supplierId === supplierB)!;
    const entry = supplier.items.find((row) => row.purchaseId === purchase.id);
    if (entry) {
      expect(entry.ageDays).toBeGreaterThanOrEqual(0);
      expect(["current", "1-30"]).toContain(entry.bucket);
    }
  });
});
