import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let getSupplierPaymentVoucher: typeof import("@/lib/server/suppliers")["getSupplierPaymentVoucher"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let getPayablesAging: typeof import("@/lib/server/payables")["getPayablesAging"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let customerId = "";
let supplierId = "";
let productId = "";
let cashAccountId = "";
let bankAccountId = "";
let bankAccountCashBankId = "";
let otherCashBankAccountId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });
const otherContext = () => ({ workspaceId: otherWorkspaceId, userId, role: "OWNER" as const });

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

async function createPOAndReceive(context: { workspaceId: string; userId: string; role: "OWNER" }, supplierId: string, productId: string, quantity: number, unitCost: number) {
  const order = await createPurchase(context, { supplierId, items: [{ productId, quantity, unitCost }], idempotencyKey: randomUUID() });
  const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  const grn = await createGoodsReceipt(context, { purchaseOrderId: order.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: quantity, acceptedQuantity: quantity, actualUnitCost: unitCost }] });
  return { order, grn };
}

describe("cash/bank + payment voucher + WHT integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale } = await import("@/lib/server/sales"));
    ({ createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ recordSupplierPayment, getSupplierPaymentVoucher } = await import("@/lib/server/suppliers"));
    ({ createCashBankAccount, getCashBankAccounts, ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ getPayablesAging } = await import("@/lib/server/payables"));

    const user = await db.user.create({ data: { clerkId: `cb-${runId}`, email: `cb-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `CashBank ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    const other = await db.workspace.create({ data: { name: `CashBank Other ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;

    const [customer, supplier, product] = await Promise.all([
      db.customer.create({ data: { workspaceId, name: "CB Customer", creditLimit: 500000 } }),
      db.supplier.create({ data: { workspaceId, name: "CB Supplier" } }),
      db.product.create({ data: { workspaceId, name: "CB Product", sku: `cb-${runId}`, stockQuantity: 500, costPrice: 50, sellingPrice: 200 } }),
    ]);
    customerId = customer.id;
    supplierId = supplier.id;
    productId = product.id;

    await db.customer.create({ data: { workspaceId: otherWorkspaceId, name: "CB Other Customer", creditLimit: 500000 } });
    await db.supplier.create({ data: { workspaceId: otherWorkspaceId, name: "CB Other Supplier" } });

    await ensureDefaultAccounts(workspaceId);
    await ensureDefaultAccounts(otherWorkspaceId);
    await createCashBankAccount(context(), { name: "Main Bank", openingBalance: 1000, isBank: true, bankName: "HBL", accountTitle: "Main Co", accountNumber: "1234" });
    await createCashBankAccount(context(), { name: "Petty Cash", openingBalance: 0, isBank: false });
    await createCashBankAccount(otherContext(), { name: "Other Bank", openingBalance: 0, isBank: true, bankName: "UBL" });

    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((a) => a.isBank === false)!.cashBankAccountId;
    bankAccountCashBankId = accounts.find((a) => a.name === "Main Bank")!.cashBankAccountId;
    bankAccountId = accounts.find((a) => a.name === "Main Bank")!.id;
    const otherAccounts = await getCashBankAccounts(otherWorkspaceId);
    otherCashBankAccountId = otherAccounts![0]!.cashBankAccountId;
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    const ids = [workspaceId, otherWorkspaceId].filter(Boolean);
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: { in: ids } } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.expense.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId: { in: ids } } } });
    await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId: { in: ids } } } });
    await db.paymentAllocation.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.payment.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.account.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.customerReturn.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.debitNote.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.creditNote.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.invoice.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: ids } } } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId: { in: ids } } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.salesOrder.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.workspace.deleteMany({ where: { id: { in: ids } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("creates cash and bank accounts with opening balances and ledger balances", async () => {
    const accounts = await getCashBankAccounts(workspaceId);
    const bank = accounts.find((a) => a.name === "Main Bank")!;
    expect(bank.isBank).toBe(true);
    expect(bank.bankName).toBe("HBL");
    expect(bank.accountTitle).toBe("Main Co");
    expect(bank.accountNumber).toBe("1234");
    expect(bank.openingBalance).toBe(1000);
    expect(bank.currentBalance).toBe(1000);
    const cash = accounts.find((a) => a.name === "Petty Cash")!;
    expect(cash.isBank).toBe(false);
    expect(cash.currentBalance).toBe(0);
  });

  it("posts a customer payment into the selected bank account and reduces AR", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 2, unitPrice: 200, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    expect(Number(invoice.amount)).toBe(400);

    const payment = await recordPayment(context(), { customerId, invoiceId: invoice.id, cashBankAccountId: bankAccountCashBankId, amount: 400, paymentDate: new Date(), method: "BANK_TRANSFER", reference: "RT-1", notes: "into bank", idempotencyKey: randomUUID() });
    const rows = await glLines(payment.id);
    const j = journalBalanced(rows);
    expect(j.balanced).toBe(true);
    expect(await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { cashBankAccount: true } })).toMatchObject({ cashBankAccountId: bankAccountCashBankId, netAmount: expect.anything() });
    const bank = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountCashBankId } });
    expect(Number(bank.currentBalance)).toBe(1400);
    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(Number(customer.currentBalance)).toBe(0);
  });

  it("records a supplier voucher with WHT: Dr AP gross, Cr WHT, Cr bank net", async () => {
    const { order } = await createPOAndReceive(context(), supplierId, productId, 10, 100);
    expect(Number((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).currentBalance)).toBe(1000);

    const gross = 1000;
    const wht = 100;
    const net = gross - wht;
    const beforeBank = Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountCashBankId } })).currentBalance);

    const payment = await recordSupplierPayment(context(), supplierId, {
      amount: gross,
      withholdingTaxAmount: wht,
      cashBankAccountId: bankAccountCashBankId,
      allocations: [{ purchaseOrderId: order.id, amount: gross }],
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "BPV-REF",
      notes: "WHT voucher",
      idempotencyKey: randomUUID(),
    });

    const rows = await glLines(payment.id);
    const j = journalBalanced(rows);
    expect(j.balanced).toBe(true);
    expect(j.debit).toBe(gross);
    expect(j.credit).toBe(gross);
    expect(sum(rows, "ACCOUNTS_PAYABLE", "debit")).toBe(gross);
    expect(sum(rows, "WITHHOLDING_TAX_PAYABLE", "credit")).toBe(wht);
    expect(rows.filter((r) => r.accountId === bankAccountId && Number(r.credit) > 0).reduce((a, r) => a + Number(r.credit), 0)).toBe(net);
    expect(rows).toHaveLength(3);

    const bank = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountCashBankId } });
    expect(Number(bank.currentBalance)).toBe(beforeBank - net);

    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(supplier.currentBalance)).toBe(0);

    const stored = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(Number(stored.amount)).toBe(gross);
    expect(Number(stored.withholdingTaxAmount)).toBe(wht);
    expect(Number(stored.netAmount!)).toBe(net);
    expect(stored.documentNumber).toMatch(/^BPV-/);
    expect(stored.cashBankAccountId).toBe(bankAccountCashBankId);
  });

  it("reduces payables aging by gross settlement including WHT", async () => {
    const { order } = await createPOAndReceive(context(), supplierId, productId, 5, 50);
    const before = await getPayablesAging(workspaceId, { asOf: new Date(), timeZone: "Asia/Karachi" });
    expect(before.totalOutstanding).toBe(250);

    const gross = 250;
    const wht = 25;
    const net = 225;
    await recordSupplierPayment(context(), supplierId, {
      amount: gross,
      withholdingTaxAmount: wht,
      cashBankAccountId: bankAccountCashBankId,
      allocations: [{ purchaseOrderId: order.id, amount: gross }],
      paymentDate: new Date(),
      method: "CASH",
      reference: "",
      notes: "",
      idempotencyKey: randomUUID(),
    });

    const after = await getPayablesAging(workspaceId, { asOf: new Date(), timeZone: "Asia/Karachi" });
    const supplierRow = after.suppliers.find((s) => s.supplierId === supplierId);
    if (supplierRow) {
      expect(supplierRow.items.some((item) => item.purchaseId === order.id)).toBe(false);
    }
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(supplier.currentBalance)).toBe(0);
    expect(Number(net)).toBe(225);
  });

  it("handles partial and multi-bill allocations on a voucher", async () => {
    const { order: p1 } = await createPOAndReceive(context(), supplierId, productId, 2, 40);
    const { order: p2 } = await createPOAndReceive(context(), supplierId, productId, 3, 60);
    const payment = await recordSupplierPayment(context(), supplierId, {
      amount: 200,
      withholdingTaxAmount: 20,
      cashBankAccountId: cashAccountId,
      allocations: [{ purchaseOrderId: p1.id, amount: 80 }, { purchaseOrderId: p2.id, amount: 120 }],
      paymentDate: new Date(),
      method: "CASH",
      reference: "",
      notes: "",
      idempotencyKey: randomUUID(),
    });
    const allocs = await db.paymentAllocation.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } });
    expect(allocs).toHaveLength(2);
    expect(Number(allocs[0].amount)).toBe(80);
    expect(Number(allocs[1].amount)).toBe(120);
    const o1 = await db.purchaseOrder.findUniqueOrThrow({ where: { id: p1.id } });
    const o2 = await db.purchaseOrder.findUniqueOrThrow({ where: { id: p2.id } });
    expect(Number(o1.balanceAmount)).toBe(0);
    expect(Number(o2.balanceAmount)).toBe(60);
    const rows = await glLines(payment.id);
    expect(journalBalanced(rows).balanced).toBe(true);
  });

  it("is idempotent for customer receipts and supplier vouchers", async () => {
    const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: 150, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    const custKey = randomUUID();
    const custInput = { customerId, invoiceId: invoice.id, cashBankAccountId: cashAccountId, amount: 150, paymentDate: new Date(), method: "CASH" as const, reference: "", notes: "", idempotencyKey: custKey };
    const cp1 = await recordPayment(context(), custInput);
    const cp2 = await recordPayment(context(), custInput);
    expect(cp2.id).toBe(cp1.id);

    const { order } = await createPOAndReceive(context(), supplierId, productId, 1, 70);
    const supKey = randomUUID();
    const supInput = { amount: 70, withholdingTaxAmount: 7, cashBankAccountId: cashAccountId, allocations: [{ purchaseOrderId: order.id, amount: 70 }], paymentDate: new Date(), method: "CASH" as const, reference: "", notes: "", idempotencyKey: supKey };
    const sp1 = await recordSupplierPayment(context(), supplierId, supInput);
    const sp2 = await recordSupplierPayment(context(), supplierId, supInput);
    expect(sp2.id).toBe(sp1.id);
  });

  it("rejects cross-workspace and inactive cash/bank accounts", async () => {
    const { order: rejectPurchase } = await createPOAndReceive(context(), supplierId, productId, 1, 10);
    await expect(recordPayment(context(), { customerId, cashBankAccountId: otherCashBankAccountId, amount: 10, paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Cash/bank account is unavailable");
    await expect(recordSupplierPayment(context(), supplierId, { amount: 10, cashBankAccountId: otherCashBankAccountId, allocations: [{ purchaseOrderId: rejectPurchase.id, amount: 10 }], paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Cash/bank account is unavailable");
    await expect(recordPayment(context(), { customerId, amount: 10, paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("cash/bank");
    await expect(recordSupplierPayment(context(), supplierId, { amount: 10, cashBankAccountId: bankAccountCashBankId, paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Allocate this payment");
  });

  it("rejects WHT exceeding gross and missing pay-from account on a voucher", async () => {
    const { order: purchase } = await createPOAndReceive(context(), supplierId, productId, 1, 30);
    const { order: purchase2 } = await createPOAndReceive(context(), supplierId, productId, 1, 30);
    await expect(recordSupplierPayment(context(), supplierId, { amount: 30, withholdingTaxAmount: 31, cashBankAccountId: cashAccountId, allocations: [{ purchaseOrderId: purchase.id, amount: 30 }], paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Withholding tax cannot exceed");
    await expect(recordSupplierPayment(context(), supplierId, { amount: 30, allocations: [{ purchaseOrderId: purchase2.id, amount: 30 }], paymentDate: new Date(), method: "CASH", reference: "", notes: "", idempotencyKey: randomUUID() })).rejects.toThrow("Select a cash/bank account");
  });

  it("persists voucher data needed for the printable document", async () => {
    const { order: purchase } = await createPOAndReceive(context(), supplierId, productId, 2, 60);
    const gross = 120;
    const payment = await recordSupplierPayment(context(), supplierId, {
      amount: gross,
      withholdingTaxAmount: 0,
      cashBankAccountId: bankAccountCashBankId,
      allocations: [{ purchaseOrderId: purchase.id, amount: gross }],
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "CHK-999",
      notes: "Voucher print test",
      idempotencyKey: randomUUID(),
    });
    const voucher = await getSupplierPaymentVoucher(workspaceId, payment.id);
    expect(voucher).not.toBeNull();
    expect(voucher!.documentNumber).toMatch(/^BPV-/);
    expect(voucher!.method).toBe("BANK_TRANSFER");
    expect(voucher!.reference).toBe("CHK-999");
    expect(voucher!.allocations.length).toBe(1);
    // @ts-expect-error Prisma types nested optional includes loosely; runtime has orderNumber
    expect(voucher!.allocations[0].purchaseOrder.orderNumber).toBe(purchase.orderNumber);
  });
});
