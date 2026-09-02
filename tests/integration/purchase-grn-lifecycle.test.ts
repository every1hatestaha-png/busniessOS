import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let updatePurchase: typeof import("@/lib/server/purchases")["updatePurchase"];
let deletePurchase: typeof import("@/lib/server/purchases")["deletePurchase"];
let updateGoodsReceipt: typeof import("@/lib/server/purchases")["updateGoodsReceipt"];
let voidGoodsReceipt: typeof import("@/lib/server/purchases")["voidGoodsReceipt"];
let deleteGoodsReceipt: typeof import("@/lib/server/purchases")["deleteGoodsReceipt"];
let PurchaseDomainError: typeof import("@/lib/server/purchases")["PurchaseDomainError"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let productId = "";
let productId2 = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function glLines(sourceId: string) {
  return db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId }, include: { account: true }, orderBy: { createdAt: "asc" } });
}
function journalBalanced(rows: Awaited<ReturnType<typeof glLines>>) {
  const d = rows.reduce((a, r) => a + Number(r.debit), 0);
  const c = rows.reduce((a, r) => a + Number(r.credit), 0);
  return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.001 };
}

describe("P1: Purchase Order & GRN Lifecycle", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, createGoodsReceipt, updatePurchase, deletePurchase, updateGoodsReceipt, voidGoodsReceipt, deleteGoodsReceipt, PurchaseDomainError } = await import("@/lib/server/purchases"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `p1-${runId}`, email: `p1-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `P1 Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    const [supplier, product, product2] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "P1 Supplier" } }),
      db.product.create({ data: { workspaceId, name: "Widget A", sku: `wa-${runId}`, stockQuantity: 0, costPrice: 25, sellingPrice: 50 } }),
      db.product.create({ data: { workspaceId, name: "Widget B", sku: `wb-${runId}`, stockQuantity: 0, costPrice: 30, sellingPrice: 60 } }),
    ]);
    supplierId = supplier.id;
    productId = product.id;
    productId2 = product2.id;

    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  // ─── PO EDIT ────────────────────────────────────────────────────────────────────

  it("1. updatePurchase: edits DRAFT PO notes and expectedDeliveryDate", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-edit-1-${runId}`,
    });

    await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "DRAFT" } });

    const result = await updatePurchase(context(), po.id, {
      notes: "Updated delivery notes",
      expectedDeliveryDate: new Date("2026-02-15"),
    });

    expect(result.id).toBe(po.id);

    const updated = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(updated?.notes).toBe("Updated delivery notes");
    expect(updated?.expectedDeliveryDate?.toISOString()).toBe("2026-02-15T00:00:00.000Z");

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("2. updatePurchase: rejects edit on ORDERED PO", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-edit-2-${runId}`,
    });

    await expect(
      updatePurchase(context(), po.id, { notes: "nope" })
    ).rejects.toThrow(PurchaseDomainError);

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("3. updatePurchase: rejects edit on RECEIVED PO", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-edit-3-${runId}`,
    });

    await expect(
      updatePurchase(context(), po.id, { notes: "nope" })
    ).rejects.toThrow(PurchaseDomainError);

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("4. updatePurchase: rejects edit for non-existent PO", async () => {
    await expect(
      updatePurchase(context(), "00000000-0000-0000-0000-000000000000", { notes: "nope" })
    ).rejects.toThrow(PurchaseDomainError);
  });

  // ─── PO DELETE ───────────────────────────────────────────────────────────────────

  it("5. deletePurchase: deletes DRAFT PO with no GRNs", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-1-${runId}`,
    });

    await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "DRAFT" } });

    const result = await deletePurchase(context(), po.id);
    expect(result.id).toBe(po.id);

    const deleted = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(deleted).toBeNull();
  });

  it("6. deletePurchase: rejects delete on ORDERED PO (must cancel instead)", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-2-${runId}`,
    });

    await expect(deletePurchase(context(), po.id)).rejects.toThrow(PurchaseDomainError);

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("7. deletePurchase: rejects delete when GRNs exist", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-3-${runId}`,
    });

    await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: (await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } }))!.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 25 }],
    });

    await expect(deletePurchase(context(), po.id)).rejects.toThrow(PurchaseDomainError);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { purchaseOrderId: po.id } } });
    await db.goodReceivedNote.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("8. deletePurchase: rejects for non-existent PO", async () => {
    await expect(deletePurchase(context(), "00000000-0000-0000-0000-000000000000")).rejects.toThrow(PurchaseDomainError);
  });

  // ─── GRN VOID ───────────────────────────────────────────────────────────────────

  it("9. voidGoodsReceipt: reverses inventory, GL, supplier balance, PO balance", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-v-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    const supplierBefore = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });
    const poBefore = await db.purchaseOrder.findUnique({ where: { id: po.id } });

    const result = await voidGoodsReceipt(context(), grn.id, { voidedReason: "Damaged goods" });
    expect(result.id).toBe(grn.id);

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(grnAfter?.status).toBe("VOIDED");
    expect(grnAfter?.voidedReason).toBe("Damaged goods");
    expect(grnAfter?.voidedAt).not.toBeNull();

    const invTxCount = await db.inventoryTransaction.count({
      where: { workspaceId, productId, reference: grn.grnNumber },
    });
    expect(invTxCount).toBe(2);

    const supplierAfter = await db.supplier.findUnique({ where: { id: supplierId }, select: { currentBalance: true } });
    expect(Number(supplierAfter!.currentBalance)).toBe(Number(supplierBefore!.currentBalance) - 1250);

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(Number(poAfter!.balanceAmount)).toBe(Number(poBefore!.balanceAmount) - 1250);
    const poItemAfter = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(Number(poItemAfter!.receivedQuantity)).toBe(0);
    expect(poAfter?.status).toBe("ORDERED");

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("10. voidGoodsReceipt: idempotent — voiding already-voided GRN is a no-op", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-v-2-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "First void" });

    const result = await voidGoodsReceipt(context(), grn.id, { voidedReason: "Should be no-op" });
    expect(result.id).toBe(grn.id);

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(grnAfter?.voidedReason).toBe("First void");

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("11. voidGoodsReceipt: rejects when supplier returns exist", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-v-3-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    const { createSupplierReturn } = await import("@/lib/server/purchases");
    await createSupplierReturn(context(), {
      purchaseOrderId: po.id,
      goodReceivedNoteId: grn.id,
      items: [{ itemId: poItem!.id, quantity: 2 }],
      reason: "Test return",
      notes: "Test return",
    });

    await expect(voidGoodsReceipt(context(), grn.id, { voidedReason: "Try void" })).rejects.toThrow(PurchaseDomainError);

    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { purchaseOrderId: po.id } } });
    await db.supplierReturn.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("12. voidGoodsReceipt: rejects when insufficient stock", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-v-4-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await db.product.update({ where: { id: productId }, data: { stockQuantity: 3 } });

    await expect(voidGoodsReceipt(context(), grn.id, { voidedReason: "No stock" })).rejects.toThrow(PurchaseDomainError);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("13. voidGoodsReceipt: recalculates weighted-average cost correctly", async () => {
    const po1 = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 50, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-wac-1-${runId}`,
    });

    const poItem1 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po1.id } });
    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: po1.id,
      items: [{ purchaseOrderItemId: poItem1!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    const po2 = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 50, unitCost: 45 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-wac-2-${runId}`,
    });

    const poItem2 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po2.id } });
    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: po2.id,
      items: [{ purchaseOrderItemId: poItem2!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 45 }],
    });

    await voidGoodsReceipt(context(), grn2.id, { voidedReason: "WAC test" });

    const invTx = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, type: "PURCHASE_RECEIPT" },
      orderBy: { createdAt: "asc" },
    });

    expect(invTx.length).toBeGreaterThanOrEqual(2);

    const productAfter = await db.product.findUnique({ where: { id: productId } });
    expect(Number(productAfter!.costPrice)).toBe(25);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn1.id } });
    await db.goodReceivedNote.delete({ where: { id: grn1.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn2.id } });
    await db.goodReceivedNote.delete({ where: { id: grn2.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po1.id } });
    await db.purchaseOrder.delete({ where: { id: po1.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po2.id } });
    await db.purchaseOrder.delete({ where: { id: po2.id } });
  });

  it("14. voidGoodsReceipt: PO status reverts to ORDERED when all GRNs voided", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-stat-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "Test status" });

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(poAfter?.status).toBe("ORDERED");
    const poItemAfter14 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(Number(poItemAfter14!.receivedQuantity)).toBe(0);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("15. voidGoodsReceipt: partial void keeps PARTIALLY_RECEIVED", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-part-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });

    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn1.id, { voidedReason: "Partial void" });

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(poAfter?.status).toBe("PARTIALLY_RECEIVED");
    const poItemAfter15 = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(Number(poItemAfter15!.receivedQuantity)).toBe(50);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn1.id } });
    await db.goodReceivedNote.delete({ where: { id: grn1.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn2.id } });
    await db.goodReceivedNote.delete({ where: { id: grn2.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("16. voidGoodsReceipt: rejects for non-existent GRN", async () => {
    await expect(voidGoodsReceipt(context(), "00000000-0000-0000-0000-000000000000", { voidedReason: "Nope" })).rejects.toThrow(PurchaseDomainError);
  });

  // ─── GRN DELETE ──────────────────────────────────────────────────────────────────

  it("17. deleteGoodsReceipt: reverses everything and removes GRN record", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-grn-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    const result = await deleteGoodsReceipt(context(), grn.id);
    expect(result.id).toBe(grn.id);

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(grnAfter).toBeNull();

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("18. deleteGoodsReceipt: rejects when supplier returns exist", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-grn-2-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    const { createSupplierReturn } = await import("@/lib/server/purchases");
    const ret = await createSupplierReturn(context(), {
      purchaseOrderId: po.id,
      goodReceivedNoteId: grn.id,
      items: [{ itemId: poItem!.id, quantity: 2 }],
      reason: "Test return",
      notes: "Test return",
    });

    await expect(deleteGoodsReceipt(context(), grn.id)).rejects.toThrow(PurchaseDomainError);

    await db.supplierReturnItem.deleteMany({ where: { supplierReturnId: ret.id } });
    await db.supplierReturn.delete({ where: { id: ret.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("19. deleteGoodsReceipt: rejects when insufficient stock", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-del-grn-3-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await db.product.update({ where: { id: productId }, data: { stockQuantity: 3 } });

    await expect(deleteGoodsReceipt(context(), grn.id)).rejects.toThrow(PurchaseDomainError);

    await db.product.update({ where: { id: productId }, data: { stockQuantity: 0 } });

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("20. deleteGoodsReceipt: rejects for non-existent GRN", async () => {
    await expect(deleteGoodsReceipt(context(), "00000000-0000-0000-0000-000000000000")).rejects.toThrow(PurchaseDomainError);
  });

  // ─── CROSS-WORKSPACE ISOLATION ──────────────────────────────────────────────────

  it("21. voidGoodsReceipt: fails for GRN in different workspace", async () => {
    const otherCtx = { workspaceId: "", userId, role: "OWNER" as const };
    const otherWs = await db.workspace.create({
      data: { name: "Other WS", members: { create: { userId, role: "OWNER" } } },
    });
    otherCtx.workspaceId = otherWs.id;

    const otherSupplier = await db.supplier.create({
      data: { workspaceId: otherWs.id, name: "Other Supplier" },
    });
    const otherProduct = await db.product.create({
      data: { workspaceId: otherWs.id, name: "Other Product", sku: `op-${runId}`, unit: "KG", costPrice: 10, sellingPrice: 20, stockQuantity: 0 },
    });

    const po = await createPurchase(otherCtx, {
      supplierId: otherSupplier.id,
      items: [{ productId: otherProduct.id, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-xws-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(otherCtx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await expect(voidGoodsReceipt(context(), grn.id, { voidedReason: "Cross workspace" })).rejects.toThrow(PurchaseDomainError);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: otherWs.id } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: otherWs.id } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.supplier.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.product.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.workspace.delete({ where: { id: otherWs.id } }).catch(() => {});
  });

  // ─── GL BALANCE INTEGRITY ───────────────────────────────────────────────────────

  it("22. voidGoodsReceipt: GL net debit/credit remains balanced", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 30 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-gl-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 100, acceptedQuantity: 100, actualUnitCost: 30 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "GL balance test" });

    const entries = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: grn.id }, select: { debit: true, credit: true } });
    const totalDebit = entries.reduce((sum: Prisma.Decimal, e: { debit: Prisma.Decimal }) => sum.add(e.debit), new Prisma.Decimal("0"));
    const totalCredit = entries.reduce((sum: Prisma.Decimal, e: { credit: Prisma.Decimal }) => sum.add(e.credit), new Prisma.Decimal("0"));
    expect(totalDebit.toString()).toBe(totalCredit.toString());

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("23. deleteGoodsReceipt: GL net debit/credit remains balanced", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 30 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-gl-2-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 100, acceptedQuantity: 100, actualUnitCost: 30 }],
    });

    await deleteGoodsReceipt(context(), grn.id);

    const entries = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: grn.id }, select: { debit: true, credit: true } });
    const totalDebit = entries.reduce((sum: Prisma.Decimal, e: { debit: Prisma.Decimal }) => sum.add(e.debit), new Prisma.Decimal("0"));
    const totalCredit = entries.reduce((sum: Prisma.Decimal, e: { credit: Prisma.Decimal }) => sum.add(e.credit), new Prisma.Decimal("0"));
    expect(totalDebit.toString()).toBe(totalCredit.toString());

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  // ─── INVENTORY TRANSACTION AUDIT TRAIL ──────────────────────────────────────────

  it("24. voidGoodsReceipt: creates PURCHASE_CANCELLATION inventory transaction", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 25, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-inv-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 25, acceptedQuantity: 25, actualUnitCost: 25 }],
    });

    const invTxBefore = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, reference: grn.grnNumber },
      orderBy: { createdAt: "asc" },
    });
    expect(invTxBefore.length).toBeGreaterThanOrEqual(1);
    expect(invTxBefore[0].type).toBe("PURCHASE_RECEIPT");

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "Audit trail" });

    const invTx = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, reference: grn.grnNumber },
      orderBy: { createdAt: "asc" },
    });
    expect(invTx).toHaveLength(2);
    expect(invTx[0].type).toBe("PURCHASE_RECEIPT");
    expect(invTx[1].type).toBe("PURCHASE_CANCELLATION");
    expect(Number(invTx[1].quantityChanged)).toBe(-25);

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("25. deleteGoodsReceipt: creates PURCHASE_CANCELLATION inventory transaction", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 25, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-inv-2-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 25, acceptedQuantity: 25, actualUnitCost: 25 }],
    });

    await deleteGoodsReceipt(context(), grn.id);

    const invTx = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, reference: grn.grnNumber },
      orderBy: { createdAt: "asc" },
    });
    expect(invTx).toHaveLength(2);
    expect(invTx[0].type).toBe("PURCHASE_RECEIPT");
    expect(invTx[1].type).toBe("PURCHASE_CANCELLATION");
    expect(Number(invTx[1].quantityChanged)).toBe(-25);

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  // ─── AUDIT LOGGING ──────────────────────────────────────────────────────────────

  it("26. updatePurchase writes audit log", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-aud-1-${runId}`,
    });

    await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "DRAFT" } });

    await updatePurchase(context(), po.id, { notes: "Audit test" });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId, entityType: "PurchaseOrder", entityId: po.id, action: "purchase.updated" },
    });
    expect(audit).not.toBeNull();

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("27. deletePurchase writes audit log", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-aud-2-${runId}`,
    });

    await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "DRAFT" } });

    await deletePurchase(context(), po.id);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId, entityType: "PurchaseOrder", entityId: po.id, action: "purchase.deleted" },
    });
    expect(audit).not.toBeNull();
  });

  it("28. voidGoodsReceipt writes audit log", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-aud-3-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "Audit test" });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId, entityType: "GoodReceivedNote", entityId: grn.id, action: "grn.voided" },
    });
    expect(audit).not.toBeNull();

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("29. deleteGoodsReceipt writes audit log", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-aud-4-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await deleteGoodsReceipt(context(), grn.id);

    const audit = await db.auditLog.findFirst({
      where: { workspaceId, entityType: "GoodReceivedNote", entityId: grn.id, action: "grn.deleted" },
    });
    expect(audit).not.toBeNull();

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  // ─── EDGE CASES ─────────────────────────────────────────────────────────────────

  it("30. voidGoodsReceipt: voiding last of multiple GRNs reverts PO to ORDERED", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-edge-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });

    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 25 }],
    });

    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn2.id, { voidedReason: "Edge 1" });
    await voidGoodsReceipt(context(), grn1.id, { voidedReason: "Edge 2" });

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(poAfter?.status).toBe("ORDERED");
    const poItemAfter = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(poItemAfter?.receivedQuantity.toString()).toBe("0");
    expect(poAfter?.balanceAmount.toString()).toBe("0");

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn1.id } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn2.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn1.id } });
    await db.goodReceivedNote.delete({ where: { id: grn1.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn2.id } });
    await db.goodReceivedNote.delete({ where: { id: grn2.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("31. voidGoodsReceipt: partial accepted quantity void is correctly handled", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 50, unitCost: 35 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-partial-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 35 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "Partial qty" });

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(poAfter?.status).toBe("ORDERED");
    const poItemAfter = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(poItemAfter?.receivedQuantity.toString()).toBe("0");

    const invTx = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, reference: grn.grnNumber },
      orderBy: { createdAt: "asc" },
    });
    expect(invTx).toHaveLength(2);
    expect(invTx[1].type).toBe("PURCHASE_CANCELLATION");
    expect(Number(invTx[1].quantityChanged)).toBe(-30);

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("32. deleteGoodsReceipt: clears balanceAmount on PO", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-bal-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await deleteGoodsReceipt(context(), grn.id);

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(poAfter?.balanceAmount.toString()).toBe("0");

    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  // ─── GRN UPDATE (PATCH) ─────────────────────────────────────────────────────────

  it("33. PATCH notes does NOT void the GRN — regression test", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-1-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
      notes: "Original notes",
      receivedBy: "Original Receiver",
      checkedBy: "QC Person",
    });

    const result = await updateGoodsReceipt(context(), grn.id, {
      notes: "Updated notes only — should NOT void",
      receivedBy: "Updated Receiver",
      checkedBy: "Updated Checker",
    });

    expect(result.id).toBe(grn.id);

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(grnAfter?.status).toBe("ACTIVE");
    expect(grnAfter?.notes).toBe("Updated notes only — should NOT void");
    expect(grnAfter?.receivedBy).toBe("Updated Receiver");
    expect(grnAfter?.checkedBy).toBe("Updated Checker");
    expect(grnAfter?.voidedAt).toBeNull();
    expect(grnAfter?.voidedReason).toBeNull();

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("34. PATCH quantity increase updates inventory and PO receivedQuantity", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-2-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 30, acceptedQuantity: 30, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 60, acceptedQuantity: 60, actualUnitCost: 25 }],
    });

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(Number(grnAfter!.totalAmount)).toBe(1500);

    const poItemAfter = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(poItemAfter?.receivedQuantity.toString()).toBe("60");

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("35. PATCH quantity decrease updates inventory and PO receivedQuantity", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-3-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 25 }],
    });

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(Number(grnAfter!.totalAmount)).toBe(500);

    const poItemAfter = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    expect(poItemAfter?.receivedQuantity.toString()).toBe("20");

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("36. PATCH quantity decrease rejects insufficient stock", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-4-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await db.inventoryTransaction.create({ data: { workspaceId, productId, type: "SALE", quantityChanged: -40, reference: "Sale reducing stock" } });
    await db.product.update({ where: { id: productId }, data: { stockQuantity: 10 } });

    await expect(
      updateGoodsReceipt(context(), grn.id, {
        items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 25 }],
      })
    ).rejects.toThrow(PurchaseDomainError);

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("37. PATCH cost change updates WAC correctly", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-5-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 35 }],
    });

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(Number(grnAfter!.totalAmount)).toBe(1750);

    const invTx = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, type: "PURCHASE_CANCELLATION", reference: grn.grnNumber },
    });
    expect(invTx.length).toBe(1);
    expect(Number(invTx[0].unitCost)).toBe(25);

    const invTxNew = await db.inventoryTransaction.findMany({
      where: { workspaceId, productId, type: "PURCHASE_RECEIPT", reference: grn.grnNumber },
    });
    expect(invTxNew.length).toBe(2);
    expect(Number(invTxNew[1].unitCost)).toBe(35);

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("38. PATCH total change updates supplier balance by DELTA", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-6-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    const supplierBefore = await db.supplier.findUnique({ where: { id: supplierId } });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 35 }],
    });

    const supplierAfter = await db.supplier.findUnique({ where: { id: supplierId } });
    const delta = new Prisma.Decimal("1750.00").minus(new Prisma.Decimal("1250.00"));
    expect(supplierAfter?.currentBalance.toString()).toBe(
      supplierBefore!.currentBalance.plus(delta).toString()
    );

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.supplier.update({ where: { id: supplierId }, data: { currentBalance: 0 } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("39. PATCH total change updates PO balance by DELTA", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-7-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await db.purchaseOrder.update({ where: { id: po.id }, data: { balanceAmount: 1250 } });

    const poBefore = await db.purchaseOrder.findUnique({ where: { id: po.id } });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 35 }],
    });

    const poAfter = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    const delta = new Prisma.Decimal("1750.00").minus(new Prisma.Decimal("1250.00"));
    expect(poAfter?.balanceAmount.toString()).toBe(
      poBefore!.balanceAmount.plus(delta).toString()
    );

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrder.update({ where: { id: po.id }, data: { balanceAmount: 0 } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("40. VOIDED GRN cannot be updated", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-8-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await voidGoodsReceipt(context(), grn.id, { voidedReason: "Already voided" });

    await expect(updateGoodsReceipt(context(), grn.id, { notes: "Cannot update voided" })).rejects.toThrow(PurchaseDomainError);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("41. cross-workspace GRN update is rejected", async () => {
    const otherCtx = { workspaceId: "", userId, role: "OWNER" as const };
    const otherWs = await db.workspace.create({
      data: { name: "Other WS Upd", members: { create: { userId, role: "OWNER" } } },
    });
    otherCtx.workspaceId = otherWs.id;

    const otherSupplier = await db.supplier.create({ data: { workspaceId: otherWs.id, name: "Other Supplier Upd" } });
    const otherProduct = await db.product.create({
      data: { workspaceId: otherWs.id, name: "Other Product Upd", sku: `opu-${runId}`, unit: "KG", costPrice: 10, sellingPrice: 20, stockQuantity: 0 },
    });

    const po = await createPurchase(otherCtx, {
      supplierId: otherSupplier.id,
      items: [{ productId: otherProduct.id, quantity: 10, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-xws-upd-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(otherCtx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 25 }],
    });

    await expect(updateGoodsReceipt(context(), grn.id, { notes: "Cross workspace hack" })).rejects.toThrow(PurchaseDomainError);

    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: otherWs.id } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: otherWs.id } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.supplier.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.product.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: otherWs.id } });
    await db.workspace.delete({ where: { id: otherWs.id } }).catch(() => {});
  });

  it("42. GL remains balanced after quantity increase update", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-gl-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 80, acceptedQuantity: 80, actualUnitCost: 25 }],
    });

    const entries = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: grn.id }, select: { debit: true, credit: true } });
    const totalDebit = entries.reduce((sum: Prisma.Decimal, e: { debit: Prisma.Decimal }) => sum.add(e.debit), new Prisma.Decimal("0"));
    const totalCredit = entries.reduce((sum: Prisma.Decimal, e: { credit: Prisma.Decimal }) => sum.add(e.credit), new Prisma.Decimal("0"));
    expect(totalDebit.toString()).toBe(totalCredit.toString());

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("43. audit event is generated for GRN update", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-aud-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, { notes: "Audit trail test" });

    const audits = await db.auditLog.findMany({
      where: { workspaceId, entityType: "GoodReceivedNote", entityId: grn.id },
    });
    const updatedAudit = audits.find((a) => a.action === "grn.updated");
    expect(updatedAudit).toBeDefined();

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("44. GRN status remains ACTIVE after notes-only update", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 100, unitCost: 25 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-upd-stat-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem!.id, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 25 }],
    });

    await updateGoodsReceipt(context(), grn.id, { notes: "Status check" });

    const grnAfter = await db.goodReceivedNote.findUnique({ where: { id: grn.id } });
    expect(grnAfter?.status).toBe("ACTIVE");
    expect(grnAfter?.voidedAt).toBeNull();
    expect(grnAfter?.voidedReason).toBeNull();

    await db.generalLedgerEntry.deleteMany({ where: { workspaceId, sourceId: grn.id } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
    await db.goodReceivedNote.delete({ where: { id: grn.id } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });
});
