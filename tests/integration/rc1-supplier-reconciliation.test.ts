import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "";
let userId = "";
let supplierId = "";
let productId = "";
let cashBankAccountId = "";

const runId = `rc1-supplier-${Date.now()}`;
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function glBalance() {
  const totals = await db.generalLedgerEntry.aggregate({ where: { workspaceId }, _sum: { debit: true, credit: true } });
  const debit = Number(totals._sum.debit ?? 0);
  const credit = Number(totals._sum.credit ?? 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.001 };
}

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  ({ db } = await import("@/lib/server/db"));

  const user = await db.user.create({ data: { clerkId: `${runId}`, email: `${runId}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `RC1 Supplier ${runId}`, members: { create: { userId, role: "OWNER" } } } });
  workspaceId = workspace.id;

  const { ensureDefaultAccounts, createCashBankAccount } = await import("@/lib/server/accounting");
  await ensureDefaultAccounts(workspaceId);
  const cashAccount = await createCashBankAccount(context(), { name: "RC1 Cash", openingBalance: 100_000, isBank: false });
  cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, accountId: cashAccount.id } })).id;

  const supplier = await db.supplier.create({ data: { workspaceId, name: "RC1 Supplier", companyName: "RC1 Supplier", currentBalance: 0 } });
  supplierId = supplier.id;
  const product = await db.product.create({ data: { workspaceId, name: "RC1 Weighted Item", sku: `RC1-W-${Date.now()}`, costPrice: 0, sellingPrice: 2000, stockQuantity: 0, unit: "PIECE", status: "ACTIVE" } });
  productId = product.id;
}, 60_000);

afterAll(async () => {
  if (!db) return;
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  await db.$disconnect();
}, 60_000);

describe("RC1 supplier reconciliation", () => {
  it("reconciles 49 pieces x 4.5kg x Rs282 and Gross-WHT-Net payment", async () => {
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { recordSupplierPayment } = await import("@/lib/server/suppliers");
    const { getSupplierStatement, getCurrentStockReport } = await import("@/lib/server/reports");
    const { getCashBankAccountLedger } = await import("@/lib/server/accounting");

    const purchase = await createPurchase(context(), {
      supplierId,
      pricingMode: "WEIGHT",
      items: [{ productId, quantity: 49, unitCost: 0, unitWeight: 4.5, perKgRate: 282 }],
      notes: "RC1 exact weighted purchase",
      idempotencyKey: randomUUID(),
    });
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    expect(Number(poItem.totalWeight)).toBe(220.5);
    expect(Number(poItem.perKgRate)).toBe(282);
    expect(Number(poItem.totalCost)).toBe(62_181);

    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: purchase.id,
      items: [{
        purchaseOrderItemId: poItem.id,
        receivedQuantity: 49,
        acceptedQuantity: 49,
        actualUnitCost: 1269,
        receivedWeightKg: 220.5,
        acceptedWeightKg: 220.5,
        ratePerKg: 282,
      }],
      idempotencyKey: randomUUID(),
    });

    const [grnRow, grnItem, productAfterGrn, supplierAfterGrn, poAfterGrn] = await Promise.all([
      db.goodReceivedNote.findUniqueOrThrow({ where: { id: grn.id } }),
      db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } }),
    ]);

    expect(Number(grnRow.totalAmount)).toBe(62_181);
    expect(Number(grnItem.acceptedWeightKg)).toBe(220.5);
    expect(Number(grnItem.ratePerKg)).toBe(282);
    expect(Number(grnItem.lineAmount)).toBe(62_181);
    expect(Number(grnItem.totalCost)).toBe(62_181);
    expect(Number(productAfterGrn.stockQuantity)).toBe(49);
    expect(Number(productAfterGrn.costPrice)).toBe(1269);
    expect(Number(supplierAfterGrn.currentBalance)).toBe(62_181);
    expect(Number(poAfterGrn.balanceAmount)).toBe(62_181);
    expect(poAfterGrn.status).toBe("RECEIVED");

    const payment = await recordSupplierPayment(context(), supplierId, {
      amount: 62_181,
      withholdingTaxAmount: 2_181,
      cashBankAccountId,
      allocations: [{ purchaseOrderId: purchase.id, amount: 62_181 }],
      method: "CASH",
      reference: "RC1-WHT",
      notes: "Gross 62181 less WHT 2181 equals net cash 60000",
      paymentDate: new Date(),
      idempotencyKey: randomUUID(),
    });

    const [paymentRow, supplier, po, cash, statement, stockReport, cashLedger, whtAccount, gl] = await Promise.all([
      db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchase.id } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      getSupplierStatement(workspaceId, supplierId),
      getCurrentStockReport(workspaceId),
      getCashBankAccountLedger(workspaceId, cashBankAccountId),
      db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "WITHHOLDING_TAX_PAYABLE" } } }),
      glBalance(),
    ]);

    expect(Number(paymentRow.amount)).toBe(62_181);
    expect(Number(paymentRow.withholdingTaxAmount)).toBe(2_181);
    expect(Number(paymentRow.netAmount)).toBe(60_000);
    expect(Number(supplier.currentBalance)).toBe(0);
    expect(Number(po.paidAmount)).toBe(62_181);
    expect(Number(po.balanceAmount)).toBe(0);
    expect(Number(cash.currentBalance)).toBe(40_000);

    expect(statement).not.toBeNull();
    expect(statement?.openingBalance).toBe(0);
    expect(statement?.closingBalance).toBe(0);
    expect(statement?.entries.map((entry) => ({ debit: entry.debit, credit: entry.credit, runningBalance: entry.runningBalance }))).toEqual([
      { debit: 0, credit: 62_181, runningBalance: 62_181 },
      { debit: 62_181, credit: 0, runningBalance: 0 },
    ]);

    expect(stockReport.totalQuantity).toBe(49);
    expect(stockReport.totalValue).toBe(62_181);
    expect(stockReport.inventoryGlBalance).toBe(62_181);
    expect(stockReport.reconciliationDifference).toBe(0);

    expect(cashLedger).not.toBeNull();
    expect(cashLedger?.currentBalance).toBe(40_000);
    expect(cashLedger?.closingBalance).toBe(40_000);
    expect(cashLedger?.reconciliationDifference).toBe(0);

    const whtGl = await db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: whtAccount.id }, _sum: { debit: true, credit: true } });
    expect(Number(whtGl._sum.credit ?? 0) - Number(whtGl._sum.debit ?? 0)).toBe(2_181);
    expect(gl.balanced).toBe(true);
    expect(gl.debit).toBe(gl.credit);
  }, 60_000);
});
