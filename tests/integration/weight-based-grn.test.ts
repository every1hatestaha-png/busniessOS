import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let getOpenPOItemsForGRN: typeof import("@/lib/server/purchases")["getOpenPOItemsForGRN"];
let getGoodsReceipt: typeof import("@/lib/server/purchases")["getGoodsReceipt"];
let updateGoodsReceipt: typeof import("@/lib/server/purchases")["updateGoodsReceipt"];
let voidGoodsReceipt: typeof import("@/lib/server/purchases")["voidGoodsReceipt"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let kgProductId = "";
let pieceProductId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function glLines(sourceId: string) {
  return db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId }, include: { account: true }, orderBy: { createdAt: "asc" } });
}
function sum(rows: Awaited<ReturnType<typeof glLines>>, systemCode: string, side: "debit" | "credit") {
  return rows.filter((r) => r.account.systemCode === systemCode).reduce((acc, r) => acc + Number(r[side]), 0);
}
function journalBalanced(rows: Awaited<ReturnType<typeof glLines>>) {
  const d = rows.reduce((a, r) => a + Number(r.debit), 0);
  const c = rows.reduce((a, r) => a + Number(r.credit), 0);
  return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.001 };
}

describe("Weight-based GRN and decimal quantity integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase } = await import("@/lib/server/purchases"));
    ({ createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ cancelPurchase } = await import("@/lib/server/purchases"));
    ({ getOpenPOItemsForGRN } = await import("@/lib/server/purchases"));
    ({ getGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ updateGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ voidGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `wt-${runId}`, email: `wt-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Weight Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    const [supplier, kgProduct, pieceProduct] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Weight Supplier" } }),
      db.product.create({ data: { workspaceId, name: "Rice Bag", sku: `rice-${runId}`, stockQuantity: 0, costPrice: 200, sellingPrice: 350, unit: "KG" } }),
      db.product.create({ data: { workspaceId, name: "Spark Plug", sku: `sp-${runId}`, stockQuantity: 0, costPrice: 50, sellingPrice: 100, unit: "PIECE" } }),
    ]);
    supplierId = supplier.id;
    kgProductId = kgProduct.id;
    pieceProductId = pieceProduct.id;

    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
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

  it("Kg product accepts decimal quantities in PO and GRN", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 4.60, unitCost: 286 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-decimal-po-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    expect(poItem.quantity.toNumber()).toBe(4.60);

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    expect(stockBefore.stockQuantity.toNumber()).toBe(0);

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.60, acceptedQuantity: 4.60, actualUnitCost: 286 }],
      idempotencyKey: `wt-decimal-grn-${runId}`,
    });
    expect(grn).toHaveProperty("id");

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBe(4.60);
  });

  it("4.60 Kg x Rs 286 = Rs 1,315.60 exactly", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 5, unitCost: 286 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-exact-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.60, acceptedQuantity: 4.60, actualUnitCost: 286 }],
      idempotencyKey: `wt-exact-grn-${runId}`,
    });

    const grnRecord = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });
    expect(Number(grnRecord.totalAmount)).toBeCloseTo(1315.60, 2);

    const gl = await glLines(grn.id);
    expect(journalBalanced(gl).balanced).toBe(true);
    expect(sum(gl, "INVENTORY", "debit")).toBeCloseTo(1315.60, 2);
    expect(sum(gl, "ACCOUNTS_PAYABLE", "credit")).toBeCloseTo(1315.60, 2);
  });

  it("inventory increases by exactly 4.60 Kg", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 10, unitCost: 286 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-inv-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const before = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.60, acceptedQuantity: 4.60, actualUnitCost: 286 }],
      idempotencyKey: `wt-inv-grn-${runId}`,
    });

    const after = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    expect(after.stockQuantity.toNumber() - before.stockQuantity.toNumber()).toBeCloseTo(4.60, 4);

    const invTx = await db.inventoryTransaction.findFirst({ where: { workspaceId, productId: kgProductId, type: "PURCHASE_RECEIPT" }, orderBy: { createdAt: "desc" } });
    expect(invTx!.quantityChanged.toNumber()).toBeCloseTo(4.60, 4);
  });

  it("partial weighted GRNs calculate remaining quantities correctly", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 10, unitCost: 200 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-partial-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 3.50, acceptedQuantity: 3.50, actualUnitCost: 200 }],
      idempotencyKey: `wt-partial-grn1-${runId}`,
    });
    expect(grn1.status).toBe("PARTIALLY_RECEIVED");

    const poItemAfter1 = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    expect(poItemAfter1.receivedQuantity.toNumber()).toBe(3.50);

    const openItems = await getOpenPOItemsForGRN(workspaceId, order.id);
    expect(openItems!.items[0].remainingQuantity).toBeCloseTo(6.50, 4);

    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 6.50, acceptedQuantity: 6.50, actualUnitCost: 200 }],
      idempotencyKey: `wt-partial-grn2-${runId}`,
    });
    expect(grn2.status).toBe("RECEIVED");

    const poItemAfter2 = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    expect(poItemAfter2.receivedQuantity.toNumber()).toBeCloseTo(10, 4);
  });

  it("multiple weighted GRNs accumulate stock correctly", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 20, unitCost: 150 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-multi-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 2.25, acceptedQuantity: 2.25, actualUnitCost: 150 }],
      idempotencyKey: `wt-multi-grn1-${runId}`,
    });
    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 3.75, acceptedQuantity: 3.75, actualUnitCost: 150 }],
      idempotencyKey: `wt-multi-grn2-${runId}`,
    });

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber() - stockBefore.stockQuantity.toNumber()).toBeCloseTo(6.00, 4);
  });

  it("piece products retain existing integer behavior", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 50, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-piece-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 50 }],
      idempotencyKey: `wt-piece-grn-${runId}`,
    });
    expect(grn).toHaveProperty("id");

    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
    expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() + 50);
  });

  it("existing GRN accounting remains correct for standard quantities", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: pieceProductId, quantity: 20, unitCost: 75 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-acc-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 75 }],
      idempotencyKey: `wt-acc-grn-${runId}`,
    });

    const gl = await glLines(grn.id);
    expect(gl.length).toBe(2);
    expect(journalBalanced(gl).balanced).toBe(true);
    expect(sum(gl, "INVENTORY", "debit")).toBe(1500);
    expect(sum(gl, "ACCOUNTS_PAYABLE", "credit")).toBe(1500);

    const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
    expect(Number(supplierAfter.currentBalance) - Number(supplierBefore.currentBalance)).toBe(1500);
  });

  it("weighted average cost recalculates correctly on mixed-unit stock", async () => {
    const stateBefore1 = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
    const stockBefore1 = stateBefore1.stockQuantity.toNumber();
    const costBefore1 = Number(stateBefore1.costPrice);

    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 10, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-wavg-po1-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 100 }],
      idempotencyKey: `wt-wavg-grn1-${runId}`,
    });

    const stateAfter1 = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
    const stockAfter1 = stateAfter1.stockQuantity.toNumber();
    const expectedCost1 = (stockBefore1 * costBefore1 + 5 * 100) / stockAfter1;
    expect(Number(stateAfter1.costPrice)).toBeCloseTo(expectedCost1, 2);

    const stateBefore2 = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
    const stockBefore2 = stateBefore2.stockQuantity.toNumber();
    const costBefore2 = Number(stateBefore2.costPrice);

    const order2 = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 10, unitCost: 200 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-wavg-po2-${runId}`,
    });
    const poItem2 = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order2.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order2.id,
      items: [{ purchaseOrderItemId: poItem2.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 200 }],
      idempotencyKey: `wt-wavg-grn2-${runId}`,
    });

    const stateAfter2 = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
    const stockAfter2 = stateAfter2.stockQuantity.toNumber();
    const expectedCost2 = (stockBefore2 * costBefore2 + 5 * 200) / stockAfter2;
    expect(Number(stateAfter2.costPrice)).toBeCloseTo(expectedCost2, 2);
  });

  it("cancelled weighted PO restores nothing when no GRN exists", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: kgProductId, quantity: 8, unitCost: 300 }],
      pricingMode: "UNIT",
      idempotencyKey: `wt-cancel-po-${runId}`,
    });

    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
    await cancelPurchase(context(), order.id, false);
    const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

    expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber());
  });

  describe("GRN weight fields lifecycle", () => {
    it("persists weight fields on GRN item for weighted receipt", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 10, unitCost: 286, perKgRate: 286, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-fields-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.6, acceptedQuantity: 4.6, actualUnitCost: 286, receivedWeightKg: 4.6, acceptedWeightKg: 4.6, ratePerKg: 286 }],
        idempotencyKey: `wt-fields-grn-${runId}`,
      });

      const grnItem = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItem.receivedWeightKg?.toNumber()).toBeCloseTo(4.6, 3);
      expect(grnItem.acceptedWeightKg?.toNumber()).toBeCloseTo(4.6, 3);
      expect(grnItem.ratePerKg?.toNumber()).toBeCloseTo(286, 2);
      expect(grnItem.lineAmount?.toNumber()).toBeCloseTo(4.6 * 286, 2);
    });

    it("lineAmount = acceptedWeightKg x ratePerKg for weighted GRN", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 20, unitCost: 200, perKgRate: 200, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-line-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 7.25, acceptedQuantity: 7, actualUnitCost: 200, receivedWeightKg: 7.25, acceptedWeightKg: 7, ratePerKg: 200 }],
        idempotencyKey: `wt-line-grn-${runId}`,
      });

      const grnItem = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItem.lineAmount?.toNumber()).toBeCloseTo(1400, 2);
      expect(grnItem.totalCost.toNumber()).toBeCloseTo(1400, 2);

      const grnRecord = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });
      expect(grnRecord.totalAmount.toNumber()).toBeCloseTo(1400, 2);
    });

    it("weighted GRN edit recalculates lineAmount correctly", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 30, unitCost: 150, perKgRate: 150, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-edit-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 150, receivedWeightKg: 10, acceptedWeightKg: 10, ratePerKg: 150 }],
        idempotencyKey: `wt-edit-grn-${runId}`,
      });

      const grnItemBefore = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItemBefore.lineAmount?.toNumber()).toBeCloseTo(1500, 2);

      await updateGoodsReceipt(context(), grn.id, {
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 12, acceptedQuantity: 12, actualUnitCost: 150, receivedWeightKg: 12, acceptedWeightKg: 12, ratePerKg: 150 }],
      });

      const grnItemAfter = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItemAfter.lineAmount?.toNumber()).toBeCloseTo(1800, 2);
      expect(grnItemAfter.totalCost.toNumber()).toBeCloseTo(1800, 2);
    });

    it("weighted GRN getGoodsReceipt returns weight fields", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 15, unitCost: 300, perKgRate: 300, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-get-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5.5, acceptedQuantity: 5.5, actualUnitCost: 300, receivedWeightKg: 5.5, acceptedWeightKg: 5.5, ratePerKg: 300 }],
        idempotencyKey: `wt-get-grn-${runId}`,
      });

      const detail = await getGoodsReceipt(workspaceId, grn.id);
      expect(detail).not.toBeNull();
      const item = detail!.items[0];
      expect(item.receivedWeightKg).toBeCloseTo(5.5, 3);
      expect(item.acceptedWeightKg).toBeCloseTo(5.5, 3);
      expect(item.ratePerKg).toBeCloseTo(300, 2);
      expect(item.lineAmount).toBeCloseTo(1650, 2);
    });

    it("weighted GRN void reverses inventory and GL correctly", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 25, unitCost: 250, perKgRate: 250, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-void-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 8, acceptedQuantity: 8, actualUnitCost: 250, receivedWeightKg: 8, acceptedWeightKg: 8, ratePerKg: 250 }],
        idempotencyKey: `wt-void-grn-${runId}`,
      });

      const glBefore = await glLines(grn.id);
      expect(journalBalanced(glBefore).balanced).toBe(true);

      await voidGoodsReceipt(context(), grn.id, { voidedReason: "Test void" });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber()).toBeCloseTo(stockBefore.stockQuantity.toNumber(), 4);

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(Number(supplierAfter.currentBalance)).toBeCloseTo(Number(supplierBefore.currentBalance), 2);

      const grnAfter = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });
      expect(grnAfter.status).toBe("VOIDED");
    });

    it("weighted GRN with partial rejection calculates lineAmount on accepted weight only", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 20, unitCost: 180, perKgRate: 180, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-reject-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 8, actualUnitCost: 180, receivedWeightKg: 10, acceptedWeightKg: 8, ratePerKg: 180 }],
        idempotencyKey: `wt-reject-grn-${runId}`,
      });

      const grnItem = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItem.receivedWeightKg?.toNumber()).toBeCloseTo(10, 3);
      expect(grnItem.acceptedWeightKg?.toNumber()).toBeCloseTo(8, 3);
      expect(grnItem.lineAmount?.toNumber()).toBeCloseTo(1440, 2);
      expect(grnItem.totalCost.toNumber()).toBeCloseTo(1440, 2);

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber() - stockBefore.stockQuantity.toNumber()).toBeCloseTo(8, 4);
    });

    it("GL entries, supplier balance, and PO balance use acceptedWeightKg x ratePerKg when weights differ", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 30, unitCost: 420, perKgRate: 420, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: randomUUID(),
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      const poBefore = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, select: { balanceAmount: true } });

      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 420, receivedWeightKg: 25, acceptedWeightKg: 20, ratePerKg: 420 }],
        idempotencyKey: randomUUID(),
      });

      const expectedFinancial = 20 * 420;
      const rejectedFinancial = 25 * 420;

      const grnItem = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItem.lineAmount?.toNumber()).toBeCloseTo(expectedFinancial, 2);
      expect(grnItem.totalCost.toNumber()).toBeCloseTo(expectedFinancial, 2);

      const grnRecord = await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } });
      expect(grnRecord.totalAmount.toNumber()).toBeCloseTo(expectedFinancial, 2);

      const gl = await db.generalLedgerEntry.findMany({ where: { sourceType: "PURCHASE_RECEIPT", sourceId: grn.id }, include: { account: true } });
      const totalDebit = gl.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = gl.reduce((sum, e) => sum + Number(e.credit), 0);
      expect(totalDebit).toBeCloseTo(expectedFinancial, 2);
      expect(totalCredit).toBeCloseTo(expectedFinancial, 2);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);

      const inventoryEntry = gl.find((e) => e.account?.category === "ASSET");
      expect(inventoryEntry).toBeDefined();
      expect(Number(inventoryEntry!.debit)).toBeCloseTo(expectedFinancial, 2);

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(supplierAfter.currentBalance.toNumber() - supplierBefore.currentBalance.toNumber()).toBeCloseTo(expectedFinancial, 2);

      const poAfter = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, select: { balanceAmount: true } });
      expect(poAfter.balanceAmount.toNumber() - poBefore.balanceAmount.toNumber()).toBeCloseTo(expectedFinancial, 2);

      expect(rejectedFinancial).not.toBe(expectedFinancial);
    });
  });

  describe("Weighted supplier return valuation", () => {
    it("A: partial supplier return from weighted GRN uses ratePerKg", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 50, unitCost: 300, perKgRate: 300, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-a-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 300, receivedWeightKg: 50, acceptedWeightKg: 50, ratePerKg: 300 }],
        idempotencyKey: `wt-sr-a-grn-${runId}`,
      });
      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });

      const ret = await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        goodReceivedNoteId: grn.id,
        items: [{ itemId: poItem.id, quantity: 20, returnedWeightKg: 20 }],
        reason: "Partial return test",
        notes: "",
        idempotencyKey: `wt-sr-a-ret-${runId}`,
      });

      const retItem = await db.supplierReturnItem.findFirstOrThrow({ where: { supplierReturnId: ret.id } });
      expect(retItem.returnedWeightKg?.toNumber()).toBeCloseTo(20, 3);
      expect(retItem.ratePerKg?.toNumber()).toBeCloseTo(300, 2);
      expect(retItem.totalCost.toNumber()).toBeCloseTo(6000, 2);

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(Number(supplierBefore.currentBalance) - Number(supplierAfter.currentBalance)).toBeCloseTo(6000, 2);

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true } });
      expect(stockBefore.stockQuantity.toNumber() - stockAfter.stockQuantity.toNumber()).toBeCloseTo(20, 4);

      const gl = await glLines(ret.id);
      expect(journalBalanced(gl).balanced).toBe(true);
      expect(sum(gl, "ACCOUNTS_PAYABLE", "debit")).toBeCloseTo(6000, 2);
    });

    it("B: returned quantity differs from returned kilograms", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 100, unitCost: 420, perKgRate: 420, unitWeight: 2.5 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-b-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 100, acceptedQuantity: 100, actualUnitCost: 420, receivedWeightKg: 250, acceptedWeightKg: 250, ratePerKg: 420 }],
        idempotencyKey: `wt-sr-b-grn-${runId}`,
      });

      const ret = await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        goodReceivedNoteId: grn.id,
        items: [{ itemId: poItem.id, quantity: 20, returnedWeightKg: 50 }],
        reason: "Weight differs from qty",
        notes: "",
        idempotencyKey: `wt-sr-b-ret-${runId}`,
      });

      const retItem = await db.supplierReturnItem.findFirstOrThrow({ where: { supplierReturnId: ret.id } });
      expect(retItem.quantity.toNumber()).toBeCloseTo(20, 4);
      expect(retItem.returnedWeightKg?.toNumber()).toBeCloseTo(50, 3);
      expect(retItem.ratePerKg?.toNumber()).toBeCloseTo(420, 2);
      expect(retItem.totalCost.toNumber()).toBeCloseTo(21000, 2);
    });

    it("C: correct supplier payable reversal", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 30, unitCost: 500, perKgRate: 500, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-c-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 500, receivedWeightKg: 30, acceptedWeightKg: 30, ratePerKg: 500 }],
        idempotencyKey: `wt-sr-c-grn-${runId}`,
      });
      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

      await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 10, returnedWeightKg: 10 }],
        reason: "Payable test",
        notes: "",
        idempotencyKey: `wt-sr-c-ret-${runId}`,
      });

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      const expectedReturn = 10 * 500;
      expect(Number(supplierBefore.currentBalance) - Number(supplierAfter.currentBalance)).toBeCloseTo(expectedReturn, 2);

      const poAfter = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(Number(poAfter.balanceAmount)).toBeCloseTo(30 * 500 - expectedReturn, 2);
    });

    it("D+E: correct inventory quantity and value reversal", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 40, unitCost: 250, perKgRate: 250, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-de-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 40, acceptedQuantity: 40, actualUnitCost: 250, receivedWeightKg: 40, acceptedWeightKg: 40, ratePerKg: 250 }],
        idempotencyKey: `wt-sr-de-grn-${runId}`,
      });

      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
      const invValueBefore = stockBefore.stockQuantity.toNumber() * Number(stockBefore.costPrice);

      await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 15, returnedWeightKg: 15 }],
        reason: "Inventory test",
        notes: "",
        idempotencyKey: `wt-sr-de-ret-${runId}`,
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: kgProductId }, select: { stockQuantity: true, costPrice: true } });
      const invValueAfter = stockAfter.stockQuantity.toNumber() * Number(stockAfter.costPrice);
      expect(stockBefore.stockQuantity.toNumber() - stockAfter.stockQuantity.toNumber()).toBeCloseTo(15, 4);

      const returnItem = await db.supplierReturnItem.findFirst({ where: { purchaseOrderItem: { productId: kgProductId }, supplierReturn: { workspaceId, status: "POSTED" } }, orderBy: { createdAt: "desc" } });
      expect(returnItem).toBeDefined();
      const returnValue = Number(returnItem!.totalCost);
      expect(Math.abs((invValueBefore - invValueAfter) - returnValue)).toBeLessThan(1);

      const invTx = await db.inventoryTransaction.findFirst({ where: { workspaceId, productId: kgProductId, type: "RETURN_OUT" }, orderBy: { createdAt: "desc" } });
      expect(invTx).toBeDefined();
      expect(invTx!.quantityChanged.toNumber()).toBeCloseTo(-15, 4);
    });

    it("F: correct GL reversal", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 25, unitCost: 350, perKgRate: 350, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-f-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 25, acceptedQuantity: 25, actualUnitCost: 350, receivedWeightKg: 25, acceptedWeightKg: 25, ratePerKg: 350 }],
        idempotencyKey: `wt-sr-f-grn-${runId}`,
      });

      const ret = await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 10, returnedWeightKg: 10 }],
        reason: "GL test",
        notes: "",
        idempotencyKey: `wt-sr-f-ret-${runId}`,
      });

      const gl = await glLines(ret.id);
      expect(journalBalanced(gl).balanced).toBe(true);
      expect(sum(gl, "ACCOUNTS_PAYABLE", "debit")).toBeCloseTo(3500, 2);
    });

    it("G: full weighted return returns entire accepted weight", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 15, unitCost: 200, perKgRate: 200, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-g-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 15, acceptedQuantity: 15, actualUnitCost: 200, receivedWeightKg: 15, acceptedWeightKg: 15, ratePerKg: 200 }],
        idempotencyKey: `wt-sr-g-grn-${runId}`,
      });

      const ret = await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 15, returnedWeightKg: 15 }],
        reason: "Full return",
        notes: "",
        idempotencyKey: `wt-sr-g-ret-${runId}`,
      });

      const retItem = await db.supplierReturnItem.findFirstOrThrow({ where: { supplierReturnId: ret.id } });
      expect(retItem.returnedWeightKg?.toNumber()).toBeCloseTo(15, 3);
      expect(retItem.totalCost.toNumber()).toBeCloseTo(3000, 2);
    });

    it("H: multiple partial returns cannot exceed accepted weight", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 20, unitCost: 280, perKgRate: 280, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `wt-sr-h-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 280, receivedWeightKg: 20, acceptedWeightKg: 20, ratePerKg: 280 }],
        idempotencyKey: `wt-sr-h-grn-${runId}`,
      });

      await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 12, returnedWeightKg: 12 }],
        reason: "Partial 1",
        notes: "",
        idempotencyKey: `wt-sr-h-ret1-${runId}`,
      });

      await createSupplierReturn(context(), {
        purchaseOrderId: order.id,
        items: [{ itemId: poItem.id, quantity: 5, returnedWeightKg: 5 }],
        reason: "Partial 2",
        notes: "",
        idempotencyKey: `wt-sr-h-ret2-${runId}`,
      });

      await expect(
        createSupplierReturn(context(), {
          purchaseOrderId: order.id,
          items: [{ itemId: poItem.id, quantity: 5, returnedWeightKg: 5 }],
          reason: "Exceeds",
          notes: "",
          idempotencyKey: `wt-sr-h-ret3-${runId}`,
        })
      ).rejects.toThrow();
    });
  });
});
