import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let voidGoodsReceipt: typeof import("@/lib/server/purchases")["voidGoodsReceipt"];
let getGoodsReceiptWithHistory: typeof import("@/lib/server/grn-history")["getGoodsReceiptWithHistory"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let productId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("GRN surviving previous-record history", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, createGoodsReceipt, voidGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ getGoodsReceiptWithHistory } = await import("@/lib/server/grn-history"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({
      data: { clerkId: `grn-history-${runId}`, email: `grn-history-${runId}@example.invalid` },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: `GRN History ${runId}`, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const [supplier, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "History Supplier" } }),
      db.product.create({
        data: {
          workspaceId,
          name: "History Product",
          sku: `history-${runId}`,
          stockQuantity: 0,
          costPrice: 10,
          sellingPrice: 20,
        },
      }),
    ]);
    supplierId = supplier.id;
    productId = product.id;

    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
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

  it("skips voided records and hides previous data when no surviving earlier GRN exists", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 30, unitCost: 10 }],
      pricingMode: "UNIT",
      idempotencyKey: `grn-history-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    const grn1 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 10 }],
      idempotencyKey: `grn-history-1-${runId}`,
    });
    const first = await getGoodsReceiptWithHistory(workspaceId, grn1.id);
    expect(first?.hasPreviousReceipt).toBe(false);
    expect(first?.items[0].previouslyReceived).toBe(0);
    expect(first?.items[0].remainingQuantity).toBe(25);

    const grn2 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 7, acceptedQuantity: 7, actualUnitCost: 10 }],
      idempotencyKey: `grn-history-2-${runId}`,
    });
    const second = await getGoodsReceiptWithHistory(workspaceId, grn2.id);
    expect(second?.hasPreviousReceipt).toBe(true);
    expect(second?.items[0].previouslyReceived).toBe(5);
    expect(second?.items[0].remainingQuantity).toBe(18);

    await voidGoodsReceipt(context(), grn2.id, { voidedReason: "Regression test: remove second GRN" });

    const grn3 = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 10 }],
      idempotencyKey: `grn-history-3-${runId}`,
    });
    const third = await getGoodsReceiptWithHistory(workspaceId, grn3.id);
    expect(third?.hasPreviousReceipt).toBe(true);
    expect(third?.items[0].previouslyReceived).toBe(5);
    expect(third?.items[0].remainingQuantity).toBe(21);

    await voidGoodsReceipt(context(), grn1.id, { voidedReason: "Regression test: remove first GRN" });

    const thirdAfterRemovingAllEarlier = await getGoodsReceiptWithHistory(workspaceId, grn3.id);
    expect(thirdAfterRemovingAllEarlier?.hasPreviousReceipt).toBe(false);
    expect(thirdAfterRemovingAllEarlier?.items[0].previouslyReceived).toBe(0);
    expect(thirdAfterRemovingAllEarlier?.items[0].remainingQuantity).toBe(26);

    await voidGoodsReceipt(context(), grn3.id, { voidedReason: "Regression test cleanup" });
  }, 30_000);
});
