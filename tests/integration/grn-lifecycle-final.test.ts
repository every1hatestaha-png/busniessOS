import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let reverseSupplierPayment: typeof import("@/lib/server/supplier-payment-reversals")["reverseSupplierPayment"];
let updateGoodsReceiptWithIntegrity: typeof import("@/lib/server/grn-mutations")["updateGoodsReceiptWithIntegrity"];
let voidGoodsReceiptWithIntegrity: typeof import("@/lib/server/grn-mutations")["voidGoodsReceiptWithIntegrity"];
let deleteGoodsReceiptWithIntegrity: typeof import("@/lib/server/grn-mutations")["deleteGoodsReceiptWithIntegrity"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let productId = "";
let cashBankAccountId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("final GRN lifecycle integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ reverseSupplierPayment } = await import("@/lib/server/supplier-payment-reversals"));
    ({ updateGoodsReceiptWithIntegrity, voidGoodsReceiptWithIntegrity, deleteGoodsReceiptWithIntegrity } = await import("@/lib/server/grn-mutations"));

    const user = await db.user.create({ data: { clerkId: `grn-final-${runId}`, email: `grn-final-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `GRN Final ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const supplier = await db.supplier.create({ data: { workspaceId, name: "GRN Final Supplier" } });
    supplierId = supplier.id;
    const product = await db.product.create({ data: { workspaceId, name: "GRN Final Product", sku: `grn-final-${runId}`, stockQuantity: 0, costPrice: 100, sellingPrice: 200 } });
    productId = product.id;

    await ensureDefaultAccounts(workspaceId);
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true } });
    cashBankAccountId = cash.id;
    await db.cashBankAccount.update({ where: { id: cash.id }, data: { currentBalance: 100_000 } });
  }, 30_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.paymentAllocation.deleteMany({ where: { workspaceId } });
    await db.payment.deleteMany({ where: { workspaceId } });
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("edits the real GRN and recalculates stock, PO progress, payable, supplier balance, GL, and receipt date", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `grn-final-edit-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      receiptDate: new Date("2026-09-01T00:00:00.000Z"),
      receivedBy: "Yasir",
      checkedBy: "Rehan",
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 100 }],
      idempotencyKey: `grn-final-edit-${runId}`,
    });

    await updateGoodsReceiptWithIntegrity(context(), grn.id, {
      receiptDate: new Date("2026-09-02T00:00:00.000Z"),
      receivedBy: "Updated Receiver",
      checkedBy: "Updated Checker",
      notes: "Full edit",
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4, acceptedQuantity: 4, actualUnitCost: 120 }],
    });

    const [savedGrn, savedItem, savedProduct, savedPo, savedPoItem, savedSupplier, activeGl] = await Promise.all([
      db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } }),
      db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } }),
      db.purchaseOrderItem.findUniqueOrThrow({ where: { id: poItem.id } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "PURCHASE_RECEIPT", sourceId: grn.id, reversedAt: null } }),
    ]);

    expect(savedGrn.receiptDate.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(savedGrn.receivedBy).toBe("Updated Receiver");
    expect(savedGrn.checkedBy).toBe("Updated Checker");
    expect(savedGrn.notes).toBe("Full edit");
    expect(Number(savedGrn.totalAmount)).toBe(480);
    expect(Number(savedItem.acceptedQuantity)).toBe(4);
    expect(Number(savedItem.unitCost)).toBe(120);
    expect(Number(savedProduct.stockQuantity)).toBe(4);
    expect(Number(savedPoItem.receivedQuantity)).toBe(4);
    expect(Number(savedPo.balanceAmount)).toBe(480);
    expect(Number(savedSupplier.currentBalance)).toBe(480);
    expect(activeGl.length).toBeGreaterThan(0);
    expect(activeGl.every((row) => row.date.toISOString() === "2026-09-02T00:00:00.000Z")).toBe(true);
    expect(activeGl.reduce((sum, row) => sum + Number(row.debit), 0)).toBe(activeGl.reduce((sum, row) => sum + Number(row.credit), 0));
  });

  it("protects paid GRNs, then allows reversal-safe void/delete after the payment is reversed", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 5, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `grn-final-paid-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 100 }],
      idempotencyKey: `grn-final-paid-${runId}`,
    });

    const payment = await recordSupplierPayment(context(), supplierId, {
      amount: 300,
      withholdingTaxAmount: 0,
      cashBankAccountId,
      allocations: [{ goodReceivedNoteId: grn.id, amount: 300 }],
      paymentDate: new Date(),
      method: "CASH",
      reference: "GRN-FINAL-PAID",
      notes: "",
      idempotencyKey: `grn-final-payment-${runId}`,
    });

    await expect(updateGoodsReceiptWithIntegrity(context(), grn.id, {
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 2, acceptedQuantity: 2, actualUnitCost: 100 }],
    })).rejects.toMatchObject({ code: "PURCHASE_HAS_PAYMENTS" });

    await expect(voidGoodsReceiptWithIntegrity(context(), grn.id, { voidedReason: "Should be blocked" })).rejects.toMatchObject({ code: "PURCHASE_HAS_PAYMENTS" });
    await expect(deleteGoodsReceiptWithIntegrity(context(), grn.id)).rejects.toMatchObject({ code: "PURCHASE_HAS_PAYMENTS" });

    await reverseSupplierPayment(context(), payment.id, "Undo settlement before GRN removal");
    await expect(deleteGoodsReceiptWithIntegrity(context(), grn.id)).resolves.toMatchObject({ id: grn.id, status: "VOIDED" });

    const [savedGrn, savedPoItem] = await Promise.all([
      db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } }),
      db.purchaseOrderItem.findUniqueOrThrow({ where: { id: poItem.id } }),
    ]);
    expect(savedGrn.status).toBe("VOIDED");
    expect(Number(savedPoItem.receivedQuantity)).toBe(0);
  });
});
