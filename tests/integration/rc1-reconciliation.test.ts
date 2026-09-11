import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "";
let userId = "";
let customerId = "";
let productId = "";
let cashBankAccountId = "";

const runId = `rc1-${Date.now()}`;
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function verifyGLBalanced() {
  const totals = await db.generalLedgerEntry.aggregate({ where: { workspaceId }, _sum: { debit: true, credit: true } });
  const totalDebit = Number(totals._sum.debit ?? 0);
  const totalCredit = Number(totals._sum.credit ?? 0);
  return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.001 };
}

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  ({ db } = await import("@/lib/server/db"));

  const user = await db.user.create({ data: { clerkId: `rc1-${runId}`, email: `rc1-${runId}@example.invalid` } });
  userId = user.id;
  const workspace = await db.workspace.create({ data: { name: `RC1 ${runId}`, members: { create: { userId, role: "OWNER" } } } });
  workspaceId = workspace.id;

  const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
  const { createProduct } = await import("@/lib/server/products");
  await ensureDefaultAccounts(workspaceId);

  const customer = await db.customer.create({
    data: {
      workspaceId,
      name: "RC1 Customer",
      companyName: "RC1 Customer",
      creditDays: 15,
      creditLimit: 0,
      currentBalance: 0,
      status: "ACTIVE",
    },
  });
  customerId = customer.id;

  productId = await createProduct(workspaceId, {
    name: "RC1 Widget",
    sku: `RC1-${Date.now()}`,
    category: "QA",
    costPrice: 600,
    sellingPrice: 1000,
    stockQuantity: 100,
    reorderLevel: 10,
    unit: "PIECE",
    status: "ACTIVE",
    description: "RC1 reconciliation product",
  });

  const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false, isActive: true } });
  cashBankAccountId = cash.id;
}, 60_000);

afterAll(async () => {
  if (!db) return;
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  await db.$disconnect();
}, 60_000);

describe("RC1 finance reconciliation", () => {
  it("reconciles sale, receipt, statement, AR, inventory, cash, GL, P&L and aging", async () => {
    const { createSale } = await import("@/lib/server/sales");
    const { recordPayment } = await import("@/lib/server/payments");
    const { getCustomerStatement, getCurrentStockReport } = await import("@/lib/server/reports");
    const { getFinancialDashboard, getProfitAndLoss, getCashBankAccountLedger } = await import("@/lib/server/accounting");
    const { getReceivablesAging } = await import("@/lib/server/receivables");

    const sale = await createSale(context(), {
      customerId,
      items: [{ productId, quantity: 50, unitPrice: 1000, discountPerUnit: 50 }],
      orderDiscount: 0,
      paidAmount: 0,
      cashBankAccountId: "",
      notes: "RC1 exact discount scenario",
      idempotencyKey: randomUUID(),
    });

    const invoice = await db.invoice.findFirstOrThrow({ where: { workspaceId, salesOrderId: sale.id } });
    expect(Number(invoice.amount)).toBe(47_500);

    await recordPayment(context(), {
      customerId,
      invoiceId: invoice.id,
      cashBankAccountId,
      amount: 10_000,
      paymentDate: new Date(),
      method: "CASH",
      reference: "RC1-RECEIPT",
      notes: "RC1 partial receipt",
      idempotencyKey: randomUUID(),
    });

    const [customer, persistedInvoice, persistedSale, product, cash, statement, stockReport, dashboard, pnl, aging, cashLedger, gl] = await Promise.all([
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      getCustomerStatement(workspaceId, customerId),
      getCurrentStockReport(workspaceId),
      getFinancialDashboard(workspaceId),
      getProfitAndLoss(workspaceId),
      getReceivablesAging(workspaceId, { asOf: new Date(), timeZone: "Asia/Karachi" }),
      getCashBankAccountLedger(workspaceId, cashBankAccountId),
      verifyGLBalanced(),
    ]);

    expect(Number(customer.currentBalance)).toBe(37_500);
    expect(Number(persistedInvoice.amount)).toBe(47_500);
    expect(Number(persistedInvoice.paidAmount)).toBe(10_000);
    expect(persistedInvoice.status).toBe("PARTIALLY_PAID");
    expect(Number(persistedSale.total)).toBe(47_500);
    expect(Number(persistedSale.paidAmount)).toBe(10_000);
    expect(Number(persistedSale.balanceAmount)).toBe(37_500);
    expect(Number(product.stockQuantity)).toBe(50);
    expect(Number(cash.currentBalance)).toBe(10_000);

    expect(statement).not.toBeNull();
    expect(statement?.openingBalance).toBe(0);
    expect(statement?.entries.map((entry) => ({ debit: entry.debit, credit: entry.credit, runningBalance: entry.runningBalance }))).toEqual([
      { debit: 47_500, credit: 0, runningBalance: 47_500 },
      { debit: 0, credit: 10_000, runningBalance: 37_500 },
    ]);
    expect(statement?.closingBalance).toBe(37_500);

    expect(stockReport.totalQuantity).toBe(50);
    expect(stockReport.totalValue).toBe(30_000);
    expect(stockReport.inventoryGlBalance).toBe(30_000);
    expect(stockReport.reconciliationDifference).toBe(0);

    expect(dashboard).toMatchObject({
      receivables: 37_500,
      inventoryValue: 30_000,
      cashBank: 10_000,
      grossSales: 47_500,
      costOfGoodsSold: 30_000,
      grossProfit: 17_500,
      netProfit: 17_500,
    });

    expect(pnl).toMatchObject({
      grossSales: 47_500,
      salesReturns: 0,
      costOfGoodsSold: 30_000,
      grossProfit: 17_500,
      operatingExpenses: 0,
      netProfit: 17_500,
    });

    expect(aging.totalOutstanding).toBe(37_500);
    expect(aging.customers).toHaveLength(1);
    expect(aging.customers[0].customerId).toBe(customerId);

    expect(cashLedger).not.toBeNull();
    expect(cashLedger?.currentBalance).toBe(10_000);
    expect(cashLedger?.closingBalance).toBe(10_000);
    expect(cashLedger?.reconciliationDifference).toBe(0);

    expect(gl.balanced).toBe(true);
    expect(gl.totalDebit).toBe(gl.totalCredit);
  }, 60_000);

  it("keeps a sale-time receipt and its cancellation reconciled to cash", async () => {
    const { createSale, cancelSale } = await import("@/lib/server/sales");

    const [cashBefore, customerBefore, productBefore] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
    ]);

    const sale = await createSale(context(), {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: 1000, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 500,
      cashBankAccountId,
      notes: "RC1 sale-time payment",
      idempotencyKey: randomUUID(),
    });

    const [cashAfterSale, customerAfterSale, productAfterSale, persistedSale, invoice] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.invoice.findFirstOrThrow({ where: { workspaceId, salesOrderId: sale.id } }),
    ]);

    expect(Number(cashAfterSale.currentBalance)).toBe(Number(cashBefore.currentBalance) + 500);
    expect(Number(customerAfterSale.currentBalance)).toBe(Number(customerBefore.currentBalance) + 500);
    expect(Number(productAfterSale.stockQuantity)).toBe(Number(productBefore.stockQuantity) - 1);
    expect(Number(persistedSale.total)).toBe(1000);
    expect(Number(persistedSale.paidAmount)).toBe(500);
    expect(Number(persistedSale.balanceAmount)).toBe(500);
    expect(Number(invoice.paidAmount)).toBe(500);
    expect(invoice.status).toBe("PARTIALLY_PAID");

    await cancelSale(context(), sale.id, true);

    const [cashAfterCancel, customerAfterCancel, productAfterCancel, cancelledSale, cancelledInvoice, gl] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      verifyGLBalanced(),
    ]);

    expect(Number(cashAfterCancel.currentBalance)).toBe(Number(cashBefore.currentBalance));
    expect(Number(customerAfterCancel.currentBalance)).toBe(Number(customerBefore.currentBalance));
    expect(Number(productAfterCancel.stockQuantity)).toBe(Number(productBefore.stockQuantity));
    expect(cancelledSale.status).toBe("CANCELLED");
    expect(Number(cancelledSale.paidAmount)).toBe(0);
    expect(Number(cancelledSale.balanceAmount)).toBe(0);
    expect(cancelledInvoice.status).toBe("CANCELLED");
    expect(Number(cancelledInvoice.paidAmount)).toBe(0);
    expect(gl.balanced).toBe(true);
  }, 60_000);
});
