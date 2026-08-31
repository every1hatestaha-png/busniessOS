import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let cancelSale: typeof import("@/lib/server/sales")["cancelSale"];
let allocateCustomerCredit: typeof import("@/lib/server/customer-credits")["allocateCustomerCredit"];
let getReceivablesAging: typeof import("@/lib/server/receivables")["getReceivablesAging"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = ""; let workspaceId = ""; let customerId = ""; let otherCustomerId = ""; let productId = ""; let cashBankAccountId = "";
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function saleWithInvoice(total = 100, paidAmount = 0) {
  const sale = await createSale(context(), { customerId, items: [{ productId, quantity: 1, unitPrice: total, discount: 0 }], orderDiscount: 0, paidAmount, ...(paidAmount > 0 ? { cashBankAccountId } : {}), notes: "", idempotencyKey: randomUUID() });
  const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
  const item = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: sale.id } });
  return { sale, invoice, item };
}

async function returnFor(itemId: string, salesOrderId: string, quantity = 1) {
  return createCustomerReturn(context(), { salesOrderId, items: [{ itemId, quantity }], restock: true, reason: "Customer return", notes: "", idempotencyKey: randomUUID() });
}

describe("customer credit allocation and receivables", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale, createCustomerReturn, cancelSale } = await import("@/lib/server/sales"));
    ({ allocateCustomerCredit } = await import("@/lib/server/customer-credits"));
    ({ getReceivablesAging } = await import("@/lib/server/receivables"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    const user = await db.user.create({ data: { clerkId: `credit-${runId}`, email: `credit-${runId}@example.invalid` } }); userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Credit ${runId}`, timezone: "Asia/Karachi", members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    const [customer, otherCustomer, product] = await Promise.all([
      db.customer.create({ data: { workspaceId, name: "Credit customer", creditLimit: 10000 } }),
      db.customer.create({ data: { workspaceId, name: "Other credit customer", creditLimit: 10000 } }),
      db.product.create({ data: { workspaceId, name: "Credit product", sku: `credit-${runId}`, stockQuantity: 200, costPrice: 20, sellingPrice: 100 } }),
    ]);
    customerId = customer.id; otherCustomerId = otherCustomer.id; productId = product.id;
    await ensureDefaultAccounts(workspaceId);
    cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) {
      await db.customerCreditAllocation.deleteMany({ where: { workspaceId } });
      await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
      await db.creditNote.deleteMany({ where: { workspaceId } });
      await db.customerReturn.deleteMany({ where: { workspaceId } });
      await db.paymentAllocation.deleteMany({ where: { workspaceId } });
      await db.payment.deleteMany({ where: { workspaceId } });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
      await db.salesOrder.deleteMany({ where: { workspaceId } });
      await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
      await db.ledgerEntry.deleteMany({ where: { workspaceId } });
      await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("creates unapplied credit exactly once for an unpaid invoice return", async () => {
    const { sale, invoice, item } = await saleWithInvoice(100, 0);
    const productBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const key = randomUUID();
    const input = { salesOrderId: sale.id, items: [{ itemId: item.id, quantity: 1 }], restock: true, reason: "Return", notes: "", idempotencyKey: key };
    const customerReturn = await createCustomerReturn(context(), input);
    expect((await createCustomerReturn(context(), input)).id).toBe(customerReturn.id);

    const [credit, invoiceAfter, customer, productAfter, savedReturn, returnGl] = await Promise.all([
      db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.customerReturn.findUniqueOrThrow({ where: { id: customerReturn.id } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "CUSTOMER_RETURN", sourceId: customerReturn.id } }),
    ]);
    expect(Number(credit.amount)).toBe(100);
    expect(Number(credit.remainingAmount)).toBe(100);
    expect(credit.status).toBe("OPEN");
    expect(Number(invoiceAfter.amount.minus(invoiceAfter.paidAmount).minus(invoiceAfter.creditApplied))).toBe(100);
    expect(Number(customer.currentBalance)).toBe(0);
    expect(productAfter.stockQuantity).toBe(productBefore.stockQuantity + 1);
    expect(returnGl.reduce((sum, entry) => sum + Number(entry.debit), 0)).toBe(returnGl.reduce((sum, entry) => sum + Number(entry.credit), 0));
    expect(await db.creditNote.count({ where: { customerReturnId: customerReturn.id } })).toBe(1);
    expect(await db.inventoryTransaction.count({ where: { workspaceId, reference: savedReturn.number } })).toBe(1);
  });

  it("creates unapplied credit for partially and fully paid invoice returns", async () => {
    const customerBefore = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const partial = await saleWithInvoice(100, 30);
    await returnFor(partial.item.id, partial.sale.id);
    const full = await saleWithInvoice(100, 100);
    await returnFor(full.item.id, full.sale.id);

    const [partialInvoice, fullInvoice, credits, customer] = await Promise.all([
      db.invoice.findUniqueOrThrow({ where: { id: partial.invoice.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: full.invoice.id } }),
      db.creditNote.findMany({ where: { workspaceId, salesOrderId: { in: [partial.sale.id, full.sale.id] } } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ]);
    expect(Number(partialInvoice.amount.minus(partialInvoice.paidAmount).minus(partialInvoice.creditApplied))).toBe(70);
    expect(Number(fullInvoice.amount.minus(fullInvoice.paidAmount).minus(fullInvoice.creditApplied))).toBe(0);
    expect(credits.every((credit) => Number(credit.remainingAmount) === 100)).toBe(true);
    expect(Number(customer.currentBalance)).toBe(Number(customerBefore.currentBalance) - 130);
  });

  it("allocates credit partially and fully without GL, cash, or customer balance effects", async () => {
    const { sale, invoice, item } = await saleWithInvoice(100, 0);
    const customerReturn = await returnFor(item.id, sale.id);
    const credit = await db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } });
    const customerBefore = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    const glBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });

    const key = randomUUID();
    const first = await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 40, idempotencyKey: key });
    expect((await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 40, idempotencyKey: key })).id).toBe(first.id);
    await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 60, idempotencyKey: randomUUID() });

    const [creditAfter, invoiceAfter, orderAfter, customerAfter, cashAfter] = await Promise.all([
      db.creditNote.findUniqueOrThrow({ where: { id: credit.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
    ]);
    expect(Number(creditAfter.appliedAmount)).toBe(100);
    expect(Number(creditAfter.remainingAmount)).toBe(0);
    expect(creditAfter.status).toBe("APPLIED");
    expect(Number(invoiceAfter.creditApplied)).toBe(100);
    expect(invoiceAfter.status).toBe("PAID");
    expect(Number(orderAfter.balanceAmount)).toBe(0);
    expect(Number(customerAfter.currentBalance)).toBe(Number(customerBefore.currentBalance));
    expect(Number(cashAfter.currentBalance)).toBe(Number(cashBefore.currentBalance));
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBe(glBefore);
  });

  it("rejects invalid credit allocations", async () => {
    const { sale, invoice, item } = await saleWithInvoice(100, 0);
    const customerReturn = await returnFor(item.id, sale.id);
    const credit = await db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } });
    const otherSale = await createSale(context(), { customerId: otherCustomerId, items: [{ productId, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    const otherInvoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: otherSale.id } });
    const cancelled = await saleWithInvoice(100, 0);
    await cancelSale(context(), cancelled.sale.id, true);

    await expect(allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 101, idempotencyKey: randomUUID() })).rejects.toThrow("available credit");
    await db.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 50, status: "PARTIALLY_PAID" } });
    await expect(allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 60, idempotencyKey: randomUUID() })).rejects.toThrow("invoice outstanding");
    await db.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 0, status: "UNPAID" } });
    await expect(allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: otherInvoice.id, amount: 10, idempotencyKey: randomUUID() })).rejects.toThrow("Invoice is unavailable");
    await expect(allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: cancelled.invoice.id, amount: 10, idempotencyKey: randomUUID() })).rejects.toThrow("Invoice is unavailable");
    await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 100, idempotencyKey: randomUUID() });
    await expect(allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: invoice.id, amount: 1, idempotencyKey: randomUUID() })).rejects.toThrow("available credit");
  }, 60_000);

  it("prevents concurrent allocations from over-allocating credit or invoices", async () => {
    const source = await saleWithInvoice(100, 0);
    const customerReturn = await returnFor(source.item.id, source.sale.id);
    const credit = await db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } });
    const first = await saleWithInvoice(80, 0);
    const second = await saleWithInvoice(80, 0);

    const results = await Promise.allSettled([
      allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: first.invoice.id, amount: 80, idempotencyKey: randomUUID() }),
      allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: second.invoice.id, amount: 80, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [creditAfter, invoices] = await Promise.all([
      db.creditNote.findUniqueOrThrow({ where: { id: credit.id } }),
      db.invoice.findMany({ where: { id: { in: [first.invoice.id, second.invoice.id] } } }),
    ]);
    expect(Number(creditAfter.appliedAmount)).toBeLessThanOrEqual(100);
    expect(invoices.every((row) => row.amount.minus(row.paidAmount).minus(row.creditApplied).greaterThanOrEqualTo(0))).toBe(true);
  }, 60_000);

  it("calculates receivables aging from payments and allocated credits while keeping unapplied credit separate", async () => {
    const old = await saleWithInvoice(120, 20);
    await db.invoice.update({ where: { id: old.invoice.id }, data: { issuedAt: new Date("2026-06-01T12:00:00.000Z"), dueDate: null } });
    const creditSource = await saleWithInvoice(50, 0);
    const customerReturn = await returnFor(creditSource.item.id, creditSource.sale.id);
    const credit = await db.creditNote.findFirstOrThrow({ where: { customerReturnId: customerReturn.id } });
    await allocateCustomerCredit(context(), { creditNoteId: credit.id, invoiceId: old.invoice.id, amount: 30, idempotencyKey: randomUUID() });
    const unappliedSource = await saleWithInvoice(40, 40);
    await returnFor(unappliedSource.item.id, unappliedSource.sale.id);

    const report = await getReceivablesAging(workspaceId, { asOf: new Date(Date.now() + 86_400_000), timeZone: "Asia/Karachi" });
    const item = report.customers.flatMap((customer) => customer.items).find((entry) => entry.invoiceId === old.invoice.id);
    expect(item).toMatchObject({ originalAmount: 120, paymentsApplied: 20, creditsApplied: 30, outstandingAmount: 70, bucket: "61+" });
    expect(report.totalOutstanding).toBeGreaterThanOrEqual(70);
    expect(report.totalUnappliedCredit).toBeGreaterThanOrEqual(40);
    expect(report.customers.flatMap((customer) => customer.items).every((entry) => entry.outstandingAmount > 0)).toBe(true);
  }, 60_000);
});
