import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let allocateCustomerCredit: typeof import("@/lib/server/customer-credits")["allocateCustomerCredit"];
let createExpense: typeof import("@/lib/server/accounting")["createExpense"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let getFinancialDashboard: typeof import("@/lib/server/accounting")["getFinancialDashboard"];
let getProfitAndLoss: typeof import("@/lib/server/accounting")["getProfitAndLoss"];
let getReceivablesAging: typeof import("@/lib/server/receivables")["getReceivablesAging"];
let getPayablesAging: typeof import("@/lib/server/payables")["getPayablesAging"];
let getCurrentStockReport: typeof import("@/lib/server/reports")["getCurrentStockReport"];
let createProduct: typeof import("@/lib/server/products")["createProduct"];
let createCustomer: typeof import("@/lib/server/customers")["createCustomer"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
const suppliers: Record<string, string> = {};
const customers: Record<string, string> = {};
const products: Record<string, string> = {};
const cashBank: Record<string, { id: string; accountId: string }> = {};
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function systemBalance(systemCode: string, normal: "DEBIT" | "CREDIT") {
  const account = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: systemCode as never } } });
  const totals = await db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: account.id }, _sum: { debit: true, credit: true } });
  const debit = Number(totals._sum.debit ?? 0);
  const credit = Number(totals._sum.credit ?? 0);
  return normal === "DEBIT" ? debit - credit : credit - debit;
}

async function invoiceFor(saleId: string) {
  return db.invoice.findUniqueOrThrow({ where: { salesOrderId: saleId } });
}

describe("BusinessOS V1 production-readiness company scenario", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, createGoodsReceipt, createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ createSale, createCustomerReturn } = await import("@/lib/server/sales"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ allocateCustomerCredit } = await import("@/lib/server/customer-credits"));
    ({ createExpense, createCashBankAccount, ensureDefaultAccounts, getFinancialDashboard, getProfitAndLoss } = await import("@/lib/server/accounting"));
    ({ getReceivablesAging } = await import("@/lib/server/receivables"));
    ({ getPayablesAging } = await import("@/lib/server/payables"));
    ({ getCurrentStockReport } = await import("@/lib/server/reports"));
    ({ createProduct } = await import("@/lib/server/products"));
    ({ createCustomer } = await import("@/lib/server/customers"));

    const stale = await db.workspace.findMany({ where: { name: { startsWith: "BUSINESSOS V1 QA COMPANY" } }, select: { id: true } });
    if (stale.length) {
      const staleIds = stale.map((workspace) => workspace.id);
      await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId: { in: staleIds } } } });
      await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: staleIds } } } });
      await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: { in: staleIds } } } });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId: { in: staleIds } } } });
      await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: staleIds } } } });
      await db.workspace.deleteMany({ where: { id: { in: staleIds } } });
      await db.user.deleteMany({ where: { clerkId: { startsWith: "v1-audit-" }, memberships: { none: {} } } });
    }

    const user = await db.user.create({ data: { clerkId: `v1-audit-${runId}`, email: `v1-audit-${runId}@example.invalid` } });
    userId = user.id;
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: `BUSINESSOS V1 QA COMPANY ${runId.slice(0, 8)}`, timezone: "Asia/Karachi", currency: "PKR", members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `BUSINESSOS V1 QA COMPANY B ${runId.slice(0, 8)}`, timezone: "Asia/Karachi", currency: "PKR", members: { create: { userId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    await ensureDefaultAccounts(workspaceId);

    const [supplierA, supplierB] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Supplier A", companyName: "Supplier A Industries" } }),
      db.supplier.create({ data: { workspaceId, name: "Supplier B", companyName: "Supplier B Traders" } }),
    ]);
    suppliers.a = supplierA.id; suppliers.b = supplierB.id;

    for (const name of ["Customer A", "Customer B", "Customer C"]) {
      customers[name.at(-1)!.toLowerCase()] = await createCustomer(workspaceId, { name, companyName: `${name} Company`, phone: "03001234567", email: `${name.replaceAll(" ", "-").toLowerCase()}@example.invalid`, city: "Karachi", address: "QA Industrial Area, Karachi", creditLimit: "1000000", openingBalance: "0", status: "ACTIVE", notes: "V1 audit" });
    }

    products.unitA = await createProduct(workspaceId, { name: "Unit Product A", sku: `UNIT-A-${runId}`, category: "QA", costPrice: 0, sellingPrice: 200, stockQuantity: 0, reorderLevel: 20, unit: "PIECE", status: "ACTIVE", description: "Unit-priced QA product" });
    products.unitB = await createProduct(workspaceId, { name: "Unit Product B", sku: `UNIT-B-${runId}`, category: "QA", costPrice: 0, sellingPrice: 100, stockQuantity: 0, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "Second unit-priced QA product" });
    products.weight = await createProduct(workspaceId, { name: "Weight Product", sku: `WEIGHT-${runId}`, category: "QA", costPrice: 0, sellingPrice: 1500, stockQuantity: 0, reorderLevel: 1, unit: "PIECE", status: "ACTIVE", description: "Weight-priced purchasing product" });

    for (const [name, openingBalance] of [["HBL Main Account", 500_000], ["Meezan Main Account", 300_000]] as const) {
      const created = await createCashBankAccount(context(), { name, openingBalance, isBank: true, bankName: name.split(" ")[0], accountTitle: "BUSINESSOS V1 QA COMPANY", accountNumber: name.startsWith("HBL") ? "QA-HBL-001" : "QA-MEEZAN-001", notes: "V1 audit" });
      const row = await db.cashBankAccount.findUniqueOrThrow({ where: { workspaceId_accountId: { workspaceId, accountId: created.id } } });
      cashBank[name.startsWith("HBL") ? "hbl" : "meezan"] = { id: row.id, accountId: row.accountId };
    }
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false } });
    cashBank.cash = { id: cash.id, accountId: cash.accountId };
  }, 120_000);

  afterAll(async () => {
    if (db && workspaceId) {
      const ids = [workspaceId, otherWorkspaceId];
      await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId: { in: ids } } } });
      await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: ids } } } });
      await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: { in: ids } } } });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId: { in: ids } } } });
      await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: ids } } } });
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
    }
    if (db && userId) await db.user.deleteMany({ where: { id: userId } });
    if (db) await db.$disconnect();
  }, 120_000);

  it("posts procurement only on accepted GRNs, including partial and weight-priced receipts", async () => {
    const before = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: products.unitA } }),
      db.supplier.findUniqueOrThrow({ where: { id: suppliers.a } }),
      db.generalLedgerEntry.count({ where: { workspaceId } }),
    ]);
    const po = await createPurchase(context(), { supplierId: suppliers.a, items: [{ productId: products.unitA, quantity: 100, unitCost: 100 }], pricingMode: "UNIT", idempotencyKey: randomUUID() });
    expect((await db.product.findUniqueOrThrow({ where: { id: products.unitA } })).stockQuantity.toNumber()).toBe(before[0].stockQuantity.toNumber());
    expect(Number((await db.supplier.findUniqueOrThrow({ where: { id: suppliers.a } })).currentBalance)).toBe(Number(before[1].currentBalance));
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBe(before[2]);
    expect(await db.ledgerEntry.count({ where: { workspaceId, referenceId: po.id } })).toBe(0);

    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const first = await createGoodsReceipt(context(), { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 60, acceptedQuantity: 60, actualUnitCost: 100 }], idempotencyKey: randomUUID() });
    expect(first.status).toBe("PARTIALLY_RECEIVED");
    const secondKey = randomUUID();
    const second = await createGoodsReceipt(context(), { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 40, acceptedQuantity: 40, actualUnitCost: 100 }], idempotencyKey: secondKey });
    expect((await createGoodsReceipt(context(), { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 40, acceptedQuantity: 40, actualUnitCost: 100 }], idempotencyKey: secondKey })).id).toBe(second.id);
    expect(second.status).toBe("RECEIVED");
    expect((await db.product.findUniqueOrThrow({ where: { id: products.unitA } })).stockQuantity.toNumber()).toBe(100);
    expect(Number((await db.supplier.findUniqueOrThrow({ where: { id: suppliers.a } })).currentBalance)).toBe(10_000);
    await expect(createGoodsReceipt(context(), { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: item.id, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 100 }], idempotencyKey: randomUUID() })).rejects.toThrow();

    const weightPo = await createPurchase(context(), { supplierId: suppliers.b, items: [{ productId: products.weight, quantity: 2, unitCost: 999_999, unitWeight: 10, perKgRate: 100 }], pricingMode: "WEIGHT", idempotencyKey: randomUUID() });
    const weightItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: weightPo.id } });
    expect(Number(weightItem.totalWeight)).toBe(20);
    expect(Number(weightItem.unitCost)).toBe(1000);
    expect(Number(weightItem.totalCost)).toBe(2000);
    await createGoodsReceipt(context(), { purchaseOrderId: weightPo.id, items: [{ purchaseOrderItemId: weightItem.id, receivedQuantity: 2, acceptedQuantity: 2, actualUnitCost: 1000 }], idempotencyKey: randomUUID() });

    const supplierReturn = await createSupplierReturn(context(), { purchaseOrderId: po.id, items: [{ itemId: item.id, quantity: 10 }], reason: "QA return", notes: "", idempotencyKey: randomUUID() });
    expect(Number((await db.supplierReturn.findUniqueOrThrow({ where: { id: supplierReturn.id } })).totalAmount)).toBe(1000);
    expect((await db.product.findUniqueOrThrow({ where: { id: products.unitA } })).stockQuantity.toNumber()).toBe(90);
  }, 120_000);

  it("settles supplier bills with WHT and posts sales, receipts, returns, and credits", async () => {
    const supplierPurchase = await db.purchaseOrder.findFirstOrThrow({ where: { workspaceId, supplierId: suppliers.a, balanceAmount: 9000 } });
    const voucher = await recordSupplierPayment(context(), suppliers.a, { amount: 5000, withholdingTaxAmount: 500, cashBankAccountId: cashBank.hbl.id, allocations: [{ purchaseOrderId: supplierPurchase.id, amount: 5000 }], method: "BANK_TRANSFER", paymentDate: new Date(), reference: "QA-WHT", notes: "", idempotencyKey: randomUUID() });
    expect(await systemBalance("WITHHOLDING_TAX_PAYABLE", "CREDIT")).toBe(500);
    expect(Number((await db.payment.findUniqueOrThrow({ where: { id: voucher.id } })).netAmount)).toBe(4500);

    const saleA1 = await createSale(context(), { customerId: customers.a, items: [{ productId: products.unitA, quantity: 10, unitPrice: 200, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "Credit sale", idempotencyKey: randomUUID() });
    const saleB = await createSale(context(), { customerId: customers.b, items: [{ productId: products.unitA, quantity: 5, unitPrice: 200, discount: 0 }], orderDiscount: 0, paidAmount: 400, cashBankAccountId: cashBank.meezan.id, notes: "Part paid", idempotencyKey: randomUUID() });
    await createSale(context(), { customerId: customers.c, items: [{ productId: products.unitA, quantity: 2, unitPrice: 200, discount: 0 }], orderDiscount: 0, paidAmount: 400, cashBankAccountId: cashBank.cash.id, notes: "Paid", idempotencyKey: randomUUID() });
    const saleA2 = await createSale(context(), { customerId: customers.a, items: [{ productId: products.unitA, quantity: 2, unitPrice: 200, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "Second credit sale", idempotencyKey: randomUUID() });
    const [invoiceA1, invoiceA2] = await Promise.all([invoiceFor(saleA1.id), invoiceFor(saleA2.id)]);
    await recordPayment(context(), { customerId: customers.a, invoiceId: invoiceA1.id, cashBankAccountId: cashBank.hbl.id, amount: 500, paymentDate: new Date(), method: "BANK_TRANSFER", reference: "QA-R1", notes: "", idempotencyKey: randomUUID() });
    await recordPayment(context(), { customerId: customers.a, cashBankAccountId: cashBank.meezan.id, amount: 600, allocations: [{ invoiceId: invoiceA1.id, amount: 300 }, { invoiceId: invoiceA2.id, amount: 300 }], paymentDate: new Date(), method: "BANK_TRANSFER", reference: "QA-R2", notes: "", idempotencyKey: randomUUID() });

    const saleBItem = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: saleB.id } });
    const customerReturn = await createCustomerReturn(context(), { salesOrderId: saleB.id, items: [{ itemId: saleBItem.id, quantity: 1 }], restock: true, reason: "QA customer return", notes: "", idempotencyKey: randomUUID() });
    const credit = await db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } });
    const invoiceB = await invoiceFor(saleB.id);
    await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoiceB.id, amount: 200, idempotencyKey: randomUUID() });

    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customers.a } })).currentBalance)).toBe(1300);
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: customers.b } })).currentBalance)).toBe(400);
    expect((await db.product.findUniqueOrThrow({ where: { id: products.unitA } })).stockQuantity.toNumber()).toBe(72);
  }, 180_000);

  it("posts operating expenses from selected accounts and reconciles every authoritative balance", async () => {
    const account = async (systemCode: string) => (await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: systemCode as never } } })).id;
    const expenses = [
      ["RENT_EXPENSE", cashBank.hbl.accountId, 1000, "Rent"],
      ["ELECTRICITY_EXPENSE", cashBank.meezan.accountId, 500, "Electricity"],
      ["FUEL_EXPENSE", cashBank.cash.accountId, 200, "Fuel"],
      ["TRANSPORT_EXPENSE", cashBank.hbl.accountId, 300, "Transport"],
      ["OFFICE_EXPENSE", cashBank.meezan.accountId, 100, "Office"],
    ] as const;
    for (const [systemCode, paymentAccountId, amount, payee] of expenses) await createExpense({ workspaceId, userId }, { expenseAccountId: await account(systemCode), paymentAccountId, amount, expenseDate: new Date(), payee, reference: `QA-${payee}`, notes: `${payee} expense`, idempotencyKey: randomUUID() });

    const [ar, ap, stock, dashboard, pnl, cashRows] = await Promise.all([
      getReceivablesAging(workspaceId),
      getPayablesAging(workspaceId),
      getCurrentStockReport(workspaceId),
      getFinancialDashboard(workspaceId),
      getProfitAndLoss(workspaceId),
      db.cashBankAccount.findMany({ where: { workspaceId, isActive: true } }),
    ]);
    const cashTotal = cashRows.reduce((sum, row) => sum + Number(row.currentBalance), 0);
    expect(ar.totalOutstanding).toBe(1700);
    expect(ap.totalOutstanding).toBe(6000);
    expect(stock.totalValue).toBe(9200);
    expect(stock.reconciliationDifference).toBe(0);
    expect(cashTotal).toBe(795_300);
    expect(pnl).toMatchObject({ grossSales: 3800, salesReturns: 200, salesRevenue: 3600, costOfGoodsSold: 1800, grossProfit: 1800, operatingExpenses: 2100, netProfit: -300 });
    expect(await systemBalance("ACCOUNTS_RECEIVABLE", "DEBIT")).toBe(ar.totalOutstanding);
    expect(await systemBalance("ACCOUNTS_PAYABLE", "CREDIT")).toBe(ap.totalOutstanding);
    expect(await systemBalance("INVENTORY", "DEBIT")).toBe(stock.totalValue);
    expect(await systemBalance("SALES_REVENUE", "CREDIT")).toBe(3600);
    expect(await systemBalance("COST_OF_GOODS_SOLD", "DEBIT")).toBe(1800);
    expect(dashboard).toMatchObject({ receivables: 1700, payables: 6000, inventoryValue: 9200, cashBank: 795_300, grossProfit: 1800, netProfit: -300, netOperatingPosition: 800_200 });

    const customerKhata = await db.ledgerEntry.aggregate({ where: { workspaceId, customerId: { not: null } }, _sum: { debit: true, credit: true } });
    const supplierKhata = await db.ledgerEntry.aggregate({ where: { workspaceId, supplierId: { not: null } }, _sum: { debit: true, credit: true } });
    expect(Number(customerKhata._sum.debit ?? 0) - Number(customerKhata._sum.credit ?? 0)).toBe(1700);
    expect(Number(supplierKhata._sum.credit ?? 0) - Number(supplierKhata._sum.debit ?? 0)).toBe(6000);

    const journals = await db.generalLedgerEntry.groupBy({ by: ["sourceType", "sourceId", "documentNo"], where: { workspaceId }, _sum: { debit: true, credit: true } });
    expect(journals.length).toBeGreaterThan(0);
    expect(journals.every((journal) => Number(journal._sum.debit ?? 0) === Number(journal._sum.credit ?? 0))).toBe(true);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    expect((await getReceivablesAging(otherWorkspaceId)).totalOutstanding).toBe(0);
    expect((await getPayablesAging(otherWorkspaceId)).totalOutstanding).toBe(0);
  }, 180_000);
});
