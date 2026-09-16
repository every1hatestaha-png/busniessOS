import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createSupplier: typeof import("@/lib/server/suppliers")["createSupplier"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let getSupplierSettlementTargets: typeof import("@/lib/server/suppliers")["getSupplierSettlementTargets"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let productId = "";
let cashBankAccountId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("supplier opening balance and GRN settlement", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ createSupplier, recordSupplierPayment, getSupplierSettlementTargets } = await import("@/lib/server/suppliers"));
    ({ createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases"));

    const user = await db.user.create({ data: { clerkId: `supplier-settlement-${runId}`, email: `supplier-settlement-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Supplier Settlement ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    await ensureDefaultAccounts(workspaceId);
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true } });
    cashBankAccountId = cash.id;
    await db.cashBankAccount.update({ where: { id: cash.id }, data: { currentBalance: 500_000 } });

    const supplier = await createSupplier(context(), {
      name: "Settlement Supplier",
      companyName: "",
      phone: "",
      email: "",
      address: "",
      city: "Lahore",
      notes: "",
      openingBalance: 100_000,
    });
    supplierId = supplier.id;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "Settlement Product",
        sku: `settlement-${runId}`,
        stockQuantity: 0,
        costPrice: 500,
        sellingPrice: 700,
      },
    });
    productId = product.id;
  }, 30_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.paymentAllocation.deleteMany({ where: { workspaceId } });
    await db.payment.deleteMany({ where: { workspaceId } });
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

  it("partially settles supplier opening balance without creating a PO allocation", async () => {
    const before = await getSupplierSettlementTargets(workspaceId, supplierId);
    expect(before?.openingBalance.originalAmount).toBe(100_000);
    expect(before?.openingBalance.outstandingAmount).toBe(100_000);

    const payment = await recordSupplierPayment(context(), supplierId, {
      cashBankAccountId,
      amount: 40_000,
      withholdingTaxAmount: 0,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "OPENING-PARTIAL",
      allocations: [{ openingBalance: true, amount: 40_000 }],
      idempotencyKey: `opening-payment-${runId}`,
    });

    const allocation = await db.paymentAllocation.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(allocation.isSupplierOpeningBalance).toBe(true);
    expect(allocation.purchaseOrderId).toBeNull();
    expect(allocation.goodReceivedNoteId).toBeNull();

    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(supplier.currentBalance)).toBe(60_000);

    const after = await getSupplierSettlementTargets(workspaceId, supplierId);
    expect(after?.openingBalance.settledAmount).toBe(40_000);
    expect(after?.openingBalance.outstandingAmount).toBe(60_000);
  });

  it("settles an explicit GRN rather than the purchase order", async () => {
    const po = await createPurchase(context(), {
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 500 }],
      pricingMode: "UNIT",
      idempotencyKey: `settlement-po-${runId}`,
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 500 }],
      idempotencyKey: `settlement-grn-${runId}`,
    });

    const before = await getSupplierSettlementTargets(workspaceId, supplierId);
    const grnBefore = before?.grns.find((row) => row.id === grn.id);
    expect(grnBefore?.outstandingAmount).toBe(5_000);

    const payment = await recordSupplierPayment(context(), supplierId, {
      cashBankAccountId,
      amount: 3_000,
      withholdingTaxAmount: 0,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "GRN-PARTIAL",
      allocations: [{ goodReceivedNoteId: grn.id, amount: 3_000 }],
      idempotencyKey: `grn-payment-${runId}`,
    });

    const allocation = await db.paymentAllocation.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(allocation.goodReceivedNoteId).toBe(grn.id);
    expect(allocation.purchaseOrderId).toBe(po.id);
    expect(allocation.isSupplierOpeningBalance).toBe(false);

    const after = await getSupplierSettlementTargets(workspaceId, supplierId);
    const grnAfter = after?.grns.find((row) => row.id === grn.id);
    expect(grnAfter?.settledAmount).toBe(3_000);
    expect(grnAfter?.outstandingAmount).toBe(2_000);

    const updatedPo = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(Number(updatedPo.paidAmount)).toBe(3_000);
    expect(Number(updatedPo.balanceAmount)).toBe(2_000);
  });
});
