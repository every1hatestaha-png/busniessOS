import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let getOpenPOItemsForGRN: typeof import("@/lib/server/purchases")["getOpenPOItemsForGRN"];
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
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId } });
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
});
