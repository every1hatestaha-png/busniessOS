import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let cancelPurchase: typeof import("@/lib/server/purchases")["cancelPurchase"];
let getPurchase: typeof import("@/lib/server/purchases")["getPurchase"];
let getOpenPOItemsForGRN: typeof import("@/lib/server/purchases")["getOpenPOItemsForGRN"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let productIdA = "";
let productIdB = "";

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

describe("PO → GRN separation integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase } = await import("@/lib/server/purchases"));
    ({ createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ cancelPurchase } = await import("@/lib/server/purchases"));
    ({ getPurchase } = await import("@/lib/server/purchases"));
    ({ getOpenPOItemsForGRN } = await import("@/lib/server/purchases"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `grn-${runId}`, email: `grn-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `GRN Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    const [supplier, productA, productB] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "GRN Supplier" } }),
      db.product.create({ data: { workspaceId, name: "Front Hub", sku: `fh-${runId}`, stockQuantity: 0, costPrice: 100, sellingPrice: 200 } }),
      db.product.create({ data: { workspaceId, name: "Disc Drum", sku: `dd-${runId}`, stockQuantity: 0, costPrice: 50, sellingPrice: 100 } }),
    ]);
    supplierId = supplier.id;
    productIdA = productA.id;
    productIdB = productB.id;

    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("1. createPurchase: NO inventory, NO payable, NO GL, NO supplier balance change", async () => {
    const productBefore = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true } });
    const supplierBefore = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });

    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 100, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-no-effects-${runId}`,
    });

    expect(order).toHaveProperty("id");

    const productAfter = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true } });
    const supplierAfter = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });

    expect(productAfter!.stockQuantity).toBe(productBefore!.stockQuantity);
    expect(Number(supplierAfter!.currentBalance)).toBe(Number(supplierBefore!.currentBalance));

    const gl = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: order.id } });
    expect(gl.length).toBe(0);

    const ledger = await db.ledgerEntry.findMany({ where: { workspaceId, referenceId: order.id } });
    expect(ledger.length).toBe(0);

    const purchase = await db.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(purchase!.status).toBe("ORDERED");
    expect(Number(purchase!.paidAmount)).toBe(0);
    expect(Number(purchase!.balanceAmount)).toBe(0);
  });

  it("2. createGoodsReceipt: increases inventory, creates payable, posts GL", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 60, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-grn-test-${runId}`,
    });

    const productBefore = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true, costPrice: true } });
    const supplierBefore = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: (await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } }))!.id, receivedQuantity: 60, acceptedQuantity: 60, actualUnitCost: 100 }],
      notes: "Full receipt",
    });

    expect(grn).toHaveProperty("id");
    expect(grn.grnNumber).toMatch(/^GRN-/);
    expect(grn.status).toBe("RECEIVED");

    const productAfter = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true, costPrice: true } });
    expect(productAfter!.stockQuantity).toBe(productBefore!.stockQuantity + 60);
    expect(Number(productAfter!.costPrice)).toBe(100);

    const supplierAfter = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });
    expect(Number(supplierAfter!.currentBalance)).toBe(Number(supplierBefore!.currentBalance) + 6000);

    const gl = await glLines(grn.id);
    expect(gl.length).toBe(2);
    expect(journalBalanced(gl).balanced).toBe(true);
    expect(sum(gl, "INVENTORY", "debit")).toBe(6000);
    expect(sum(gl, "ACCOUNTS_PAYABLE", "credit")).toBe(6000);

    const invTx = await db.inventoryTransaction.findMany({ where: { workspaceId, reference: grn.grnNumber } });
    expect(invTx.length).toBe(1);
    expect(invTx[0].type).toBe("PURCHASE_RECEIPT");
    expect(invTx[0].quantityChanged).toBe(60);

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });
    expect(poItem!.receivedQuantity).toBe(60);

    const purchase = await db.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(purchase!.status).toBe("RECEIVED");
    expect(Number(purchase!.paidAmount)).toBe(0);
    expect(Number(purchase!.balanceAmount)).toBe(6000);
  });

  it("3. partial receiving: 100 ordered, 60 received, 40 remaining", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdB, quantity: 100, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-partial-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });

    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 60, acceptedQuantity: 60, actualUnitCost: 50 }],
    });

    expect(grn1.status).toBe("PARTIALLY_RECEIVED");

    const purchaseAfter1 = await db.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(purchaseAfter1!.status).toBe("PARTIALLY_RECEIVED");

    const poItemAfter1 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });
    expect(poItemAfter1!.receivedQuantity).toBe(60);

    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 40, acceptedQuantity: 40, actualUnitCost: 50 }],
    });

    expect(grn2.status).toBe("RECEIVED");

    const purchaseAfter2 = await db.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(purchaseAfter2!.status).toBe("RECEIVED");

    const poItemAfter2 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });
    expect(poItemAfter2!.receivedQuantity).toBe(100);

    const allGrns = await db.goodReceivedNote.findMany({ where: { purchaseOrderId: order.id } });
    expect(allGrns.length).toBe(2);
  });

  it("4. over-receipt is rejected", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 10, unitCost: 80 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-overreceipt-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 80 }],
    });

    await expect(
      createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 80 }],
      })
    ).rejects.toThrow();
  });

  it("5. actual receipt value vs expected: payable uses accepted value", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 100, unitCost: 200 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-value-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });
    const supplierBefore = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 80, acceptedQuantity: 75, actualUnitCost: 190 }],
    });

    const supplierAfter = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });
    const payableIncrease = Number(supplierAfter!.currentBalance) - Number(supplierBefore!.currentBalance);
    expect(payableIncrease).toBe(75 * 190);

    const gl = await glLines(grn.id);
    expect(sum(gl, "ACCOUNTS_PAYABLE", "credit")).toBe(75 * 190);
    expect(sum(gl, "INVENTORY", "debit")).toBe(75 * 190);
  });

  it("6. multiple items GRN", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [
        { productId: productIdA, quantity: 50, unitCost: 100 },
        { productId: productIdB, quantity: 30, unitCost: 50 },
      ],
      pricingMode: "UNIT",
      idempotencyKey: `po-multi-${runId}`,
    });

    const items = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: order.id } });
    const productBeforeA = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true } });
    const productBeforeB = await db.product.findUnique({ where: { id: productIdB }, select: { stockQuantity: true } });

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: items.map((item) => ({
        purchaseOrderItemId: item.id,
        receivedQuantity: item.quantity,
        acceptedQuantity: item.quantity,
        actualUnitCost: Number(item.unitCost),
      })),
    });

    expect(grn.status).toBe("RECEIVED");

    const productAfterA = await db.product.findUnique({ where: { id: productIdA }, select: { stockQuantity: true } });
    const productAfterB = await db.product.findUnique({ where: { id: productIdB }, select: { stockQuantity: true } });

    expect(productAfterA!.stockQuantity).toBe(productBeforeA!.stockQuantity + 50);
    expect(productAfterB!.stockQuantity).toBe(productBeforeB!.stockQuantity + 30);
  });

  it("7. cancel PO before GRN: no financial reversal needed", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 10, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-cancel-before-${runId}`,
    });

    const result = await cancelPurchase(context(), order.id, false);
    expect(result.id).toBe(order.id);

    const purchase = await db.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(purchase!.status).toBe("CANCELLED");
  });

  it("8. open PO items endpoint shows remaining quantities", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 100, unitCost: 75 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-open-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });

    await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 75 }],
    });

    const openItems = await getOpenPOItemsForGRN(workspaceId, order.id);
    expect(openItems).not.toBeNull();
    expect(openItems!.items.length).toBe(1);
    expect(openItems!.items[0].remainingQuantity).toBe(70);
  });

  it("9. idempotency: same idempotencyKey returns existing PO", async () => {
    const key = `po-idempotent-${runId}`;
    const first = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 5, unitCost: 10 }],
      idempotencyKey: key,
    });
    const second = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 5, unitCost: 10 }],
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
  });

  it("9b. GRN idempotency: same key does not duplicate stock, payable, or GL", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 4, unitCost: 20 }],
      idempotencyKey: `po-grn-idempotent-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const productBefore = await db.product.findUniqueOrThrow({ where: { id: productIdA }, select: { stockQuantity: true } });
    const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
    const key = `grn-idempotent-${runId}`;

    const first = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 20 }],
      idempotencyKey: key,
    });
    const second = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 20 }],
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    expect(await db.goodReceivedNote.count({ where: { purchaseOrderId: order.id } })).toBe(1);
    expect(await db.inventoryTransaction.count({ where: { workspaceId, reference: first.grnNumber } })).toBe(1);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId, sourceId: first.id } })).toBe(2);
    expect((await db.product.findUniqueOrThrow({ where: { id: productIdA } })).stockQuantity).toBe(productBefore.stockQuantity + 4);
    expect(Number((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).currentBalance)).toBe(Number(supplierBefore.currentBalance) + 80);
  });

  it("9c. duplicate GRN lines for the same PO item are rejected", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 5, unitCost: 10 }],
      idempotencyKey: `po-grn-duplicate-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

    await expect(createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [
        { purchaseOrderItemId: poItem.id, receivedQuantity: 3, acceptedQuantity: 3, actualUnitCost: 10 },
        { purchaseOrderItemId: poItem.id, receivedQuantity: 3, acceptedQuantity: 3, actualUnitCost: 10 },
      ],
    })).rejects.toThrow("Duplicate purchase order items");
  });

  it("10. receiving for cancelled PO is rejected", async () => {
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 10, unitCost: 50 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-cancel-grn-${runId}`,
    });

    await cancelPurchase(context(), order.id, false);

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: order.id } });

    await expect(
      createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 50 }],
      })
    ).rejects.toThrow();
  });

  it("11. derives weight-priced PO and GRN values without multiplying quantity twice", async () => {
    const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
    const order = await createPurchase(context(), {
      supplierId,
      items: [{ productId: productIdA, quantity: 2, unitCost: 999999, unitWeight: 10, perKgRate: 100 }],
      pricingMode: "WEIGHT",
      idempotencyKey: `po-weight-${runId}`,
    });
    const purchase = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(Number(purchase.totalAmount)).toBe(2000);
    expect(purchase.items[0]).toMatchObject({ quantity: 2 });
    expect(Number(purchase.items[0].unitCost)).toBe(1000);
    expect(Number(purchase.items[0].totalWeight)).toBe(20);

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: purchase.items[0].id, receivedQuantity: 2, acceptedQuantity: 2, actualUnitCost: Number(purchase.items[0].unitCost) }],
      idempotencyKey: `grn-weight-${runId}`,
    });
    expect(Number((await db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } })).totalAmount)).toBe(2000);
    expect(Number((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).currentBalance) - Number(supplierBefore.currentBalance)).toBe(2000);
    expect(sum(await glLines(grn.id), "INVENTORY", "debit")).toBe(2000);
  });

  it("12. keeps rejected GRN quantities open for replacement receipt", async () => {
    const order = await createPurchase(context(), { supplierId, items: [{ productId: productIdB, quantity: 10, unitCost: 50 }], idempotencyKey: `po-rejected-${runId}` });
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const first = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: item.id, receivedQuantity: 10, acceptedQuantity: 6, actualUnitCost: 50 }],
      idempotencyKey: `grn-rejected-1-${runId}`,
    });
    expect(first.status).toBe("PARTIALLY_RECEIVED");
    expect((await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: item.id } })).receivedQuantity).toBe(6);

    const second = await createGoodsReceipt(context(), {
      purchaseOrderId: order.id,
      items: [{ purchaseOrderItemId: item.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 50 }],
      idempotencyKey: `grn-rejected-2-${runId}`,
    });
    expect(second.status).toBe("RECEIVED");
    expect((await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: item.id } })).receivedQuantity).toBe(10);
  });

  it("13. historical RECEIVED purchase remains valid", async () => {
    const historicalOrder = await db.purchaseOrder.create({
      data: {
        workspaceId,
        supplierId,
        orderNumber: "PO-HIST-001",
        status: "RECEIVED",
        totalAmount: 5000,
        paidAmount: 5000,
        balanceAmount: 0,
      },
    });

    const purchase = await getPurchase(workspaceId, historicalOrder.id);
    expect(purchase).not.toBeNull();
    expect(purchase!.status).toBe("RECEIVED");
    expect(purchase!.total).toBe(5000);
    expect(purchase!.paid).toBe(5000);
    expect(purchase!.outstanding).toBe(0);

    await db.purchaseOrder.delete({ where: { id: historicalOrder.id } });
  });
});
