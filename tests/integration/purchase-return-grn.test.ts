import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let listSupplierReturns: typeof import("@/lib/server/purchases")["listSupplierReturns"];
let getSupplierReturn: typeof import("@/lib/server/purchases")["getSupplierReturn"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let pieceProductId = "";
let kgProductId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function glLines(sourceId: string) {
  return db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId }, include: { account: true }, orderBy: { createdAt: "asc" } });
}

describe("Supplier return with GRN linking integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase } = await import("@/lib/server/purchases"));
    ({ createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ listSupplierReturns } = await import("@/lib/server/purchases"));
    ({ getSupplierReturn } = await import("@/lib/server/purchases"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `sr-${runId}`, email: `sr-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `SR Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    const [supplier, pieceProduct, kgProduct] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Return Supplier" } }),
      db.product.create({ data: { workspaceId, name: "Bearing", sku: `bear-${runId}`, stockQuantity: 0, costPrice: 200, sellingPrice: 400, unit: "PIECE" } }),
      db.product.create({ data: { workspaceId, name: "Cotton", sku: `cotton-${runId}`, stockQuantity: 0, costPrice: 286, sellingPrice: 450, unit: "KG" } }),
    ]);
    supplierId = supplier.id;
    pieceProductId = pieceProduct.id;
    kgProductId = kgProduct.id;

    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("piece return works against received GRN", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 100, unitCost: 200 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-piece-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 200 }],
      idempotencyKey: `sr-piece-grn-${runId}`,
    });

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
    const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 10 }],
      reason: "Defective",
      notes: "",
      idempotencyKey: `sr-piece-ret-${runId}`,
    });
    expect(ret).toHaveProperty("id");

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() - 10);

    const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
    expect(Number(supplierAfter.currentBalance)).toBe(Number(supplierBefore.currentBalance) - 2000);

    const invTx = await db.inventoryTransaction.findFirst({ where: { workspaceId, productId: pieceProductId, type: "RETURN_OUT" }, orderBy: { createdAt: "desc" } });
    expect(invTx!.quantityChanged.toNumber()).toBe(-10);
  });

  it("decimal Kg return works", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 20, unitCost: 286 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-kg-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 286 }],
      idempotencyKey: `sr-kg-grn-${runId}`,
    });

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 4.60 }],
      reason: "Quality issue",
      notes: "",
      idempotencyKey: `sr-kg-ret-${runId}`,
    });
    expect(ret).toHaveProperty("id");

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBeCloseTo(stockBefore.stockQuantity.toNumber() - 4.60, 4);
  });

  it("4.60 Kg x Rs 286 = Rs 1,315.60 return value", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 20, unitCost: 286 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-exact-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 286 }],
      idempotencyKey: `sr-exact-grn-${runId}`,
    });

    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 4.60 }],
      reason: "Weight issue",
      notes: "",
      idempotencyKey: `sr-exact-ret-${runId}`,
    });

    const returnRecord = await db.supplierReturn.findUniqueOrThrow({ where: { id: ret.id } });
    expect(Number(returnRecord.totalAmount)).toBeCloseTo(1315.60, 2);

    const gl = await glLines(ret.id);
    expect(gl.length).toBe(2);
    const glDebit = gl.reduce((a, r) => a + Number(r.debit), 0);
    const glCredit = gl.reduce((a, r) => a + Number(r.credit), 0);
    expect(Math.abs(glDebit - glCredit)).toBeLessThan(0.01);
  });

  it("inventory decreases correctly on return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 50, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-inv-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 100 }],
      idempotencyKey: `sr-inv-grn-${runId}`,
    });

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 15 }],
      reason: "Overstock",
      notes: "",
      idempotencyKey: `sr-inv-ret-${runId}`,
    });

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() - 15);

    const invTx = await db.inventoryTransaction.findMany({ where: { workspaceId, productId: pieceProductId, type: "RETURN_OUT" } });
    expect(invTx.length).toBeGreaterThan(0);
  });

  it("no cash/bank transaction is created on supplier return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 30, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-nocash-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 100 }],
      idempotencyKey: `sr-nocash-grn-${runId}`,
    });

    const cashBefore = await db.cashBankAccount.findMany({ where: { workspaceId }, select: { currentBalance: true } });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Test",
      notes: "",
      idempotencyKey: `sr-nocash-ret-${runId}`,
    });

    const cashAfter = await db.cashBankAccount.findMany({ where: { workspaceId }, select: { currentBalance: true } });
    cashBefore.forEach((before, i) => {
      expect(Number(cashAfter[i].currentBalance)).toBe(Number(before.currentBalance));
    });

    const payments = await db.payment.findMany({ where: { workspaceId, supplierId } });
    expect(payments.length).toBe(0);
  });

  it("cannot return more than received quantity", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-overret-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 50 }],
      idempotencyKey: `sr-overret-grn-${runId}`,
    });

    await expect(
      createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 15 }],
        reason: "Exceed",
        notes: "",
        idempotencyKey: `sr-overret-ret-${runId}`,
      })
    ).rejects.toThrow();
  });

  it("cannot return more than remaining returnable quantity", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-partial-ret-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 50 }],
      idempotencyKey: `sr-partial-ret-grn-${runId}`,
    });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 8 }],
      reason: "First return",
      notes: "",
      idempotencyKey: `sr-partial-ret1-${runId}`,
    });

    await expect(
      createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 3 }],
        reason: "Exceed remaining",
        notes: "",
        idempotencyKey: `sr-partial-ret2-${runId}`,
      })
    ).rejects.toThrow();
  });

  it("multiple partial returns work correctly", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 50, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-multi-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 100 }],
      idempotencyKey: `sr-multi-grn-${runId}`,
    });

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 10 }],
      reason: "Return 1",
      notes: "",
      idempotencyKey: `sr-multi-ret1-${runId}`,
    });
    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Return 2",
      notes: "",
      idempotencyKey: `sr-multi-ret2-${runId}`,
    });

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() - 15);
  });

  it("return can be created against a specific GRN", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 100, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-grn-link-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 100 }],
      idempotencyKey: `sr-grn-link-grn-${runId}`,
    });

    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      goodReceivedNoteId: grn.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "GRN-specific return",
      notes: "",
      idempotencyKey: `sr-grn-link-ret-${runId}`,
    });
    expect(ret).toHaveProperty("id");

    const returnRecord = await db.supplierReturn.findUniqueOrThrow({ where: { id: ret.id } });
    expect(returnRecord.goodReceivedNoteId).toBe(grn.id);
  });

  it("historical GRN is unchanged after return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 75 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-hist-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 75 }],
      idempotencyKey: `sr-hist-grn-${runId}`,
    });

    const grnBefore = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Test",
      notes: "",
      idempotencyKey: `sr-hist-ret-${runId}`,
    });

    const grnAfter = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });
    expect(Number(grnAfter.totalAmount)).toBe(Number(grnBefore.totalAmount));
  });

  it("PO paid amount remains unchanged after supplier return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-po-paid-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 100 }],
      idempotencyKey: `sr-po-paid-grn-${runId}`,
    });

    const poBefore = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(poBefore.paidAmount)).toBe(0);

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Test",
      notes: "",
      idempotencyKey: `sr-po-paid-ret-${runId}`,
    });

    const poAfter = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(poAfter.paidAmount)).toBe(Number(poBefore.paidAmount));
  });

  it("listSupplierReturns returns all returns", async () => {
    const returns = await listSupplierReturns(workspaceId);
    expect(returns.length).toBeGreaterThan(0);
    returns.forEach((r) => {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("number");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("total");
    });
  });

  it("getSupplierReturn returns full detail with items", async () => {
    const returns = await listSupplierReturns(workspaceId);
    const first = returns[0];
    const detail = await getSupplierReturn(workspaceId, first.id);
    expect(detail).not.toBeNull();
    expect(detail!.items.length).toBeGreaterThan(0);
    expect(detail!.supplier).toHaveProperty("name");
    expect(detail!.purchaseOrder).toHaveProperty("orderNumber");
  });

  it("supplier return is idempotent", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-idem-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 50 }],
      idempotencyKey: `sr-idem-grn-${runId}`,
    });

    const key = `sr-idem-ret-${runId}`;
    const first = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Idem test",
      notes: "",
      idempotencyKey: key,
    });
    const second = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Idem test",
      notes: "",
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);

    const returnCount = await db.supplierReturn.count({ where: { purchaseOrderId: order.id } });
    expect(returnCount).toBe(1);
  });

  it("PO balance decreases by return amount", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 50, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-bal-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 100 }],
      idempotencyKey: `sr-bal-grn-${runId}`,
    });

    const poBefore = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    const balanceBefore = Number(poBefore.balanceAmount);

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 10 }],
      reason: "Balance test",
      notes: "",
      idempotencyKey: `sr-bal-ret-${runId}`,
    });

    const poAfter = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(poAfter.balanceAmount)).toBe(balanceBefore - 1000);
  });

  it("debit note is created for supplier return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 30, unitCost: 80 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-debit-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 80 }],
      idempotencyKey: `sr-debit-grn-${runId}`,
    });

    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Debit test",
      notes: "",
      idempotencyKey: `sr-debit-ret-${runId}`,
    });

    const returnRecord = await db.supplierReturn.findUniqueOrThrow({ where: { id: ret.id } });
    const debitNote = await db.debitNote.findFirst({ where: { workspaceId, reference: returnRecord.number } });
    expect(debitNote).not.toBeNull();
    expect(Number(debitNote!.amount)).toBe(400);
  });

  it("weighted average cost preserved after partial return", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `sr-wavg-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 100 }],
      idempotencyKey: `sr-wavg-grn-${runId}`,
    });

    const costBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { costPrice: true } });

    await createSupplierReturn(context(), {
      purchaseOrderId: order.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Wavg test",
      notes: "",
      idempotencyKey: `sr-wavg-ret-${runId}`,
    });

    const costAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { costPrice: true } });
    expect(Number(costAfter.costPrice)).toBeCloseTo(Number(costBefore.costPrice), 2);
  });
});
