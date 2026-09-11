import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let reverseCustomerPayment: typeof import("@/lib/server/payments")["reverseCustomerPayment"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let invoiceId = "";
let saleId = "";
let cashBankAccountId = "";
let paymentId = "";

describe("customer payment reversal", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ recordPayment, reverseCustomerPayment } = await import("@/lib/server/payments"));

    const user = await db.user.create({ data: { clerkId: `payment-reversal-${runId}`, email: `payment-reversal-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Payment reversal ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);

    const customer = await db.customer.create({ data: { workspaceId, name: "Reversal Customer", currentBalance: 100 } });
    customerId = customer.id;
    const sale = await db.salesOrder.create({ data: { workspaceId, customerId, orderNumber: `SO-REV-${runId}`, status: "CONFIRMED", subtotal: 100, total: 100, paidAmount: 0, balanceAmount: 100 } });
    saleId = sale.id;
    const invoice = await db.invoice.create({ data: { workspaceId, customerId, salesOrderId: saleId, invoiceNumber: `INV-REV-${runId}`, status: "UNPAID", amount: 100, paidAmount: 0 } });
    invoiceId = invoice.id;
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false } });
    cashBankAccountId = cash.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("reverses a standalone allocated receipt across customer, invoice, sale, cash, ledger and GL", async () => {
    const recorded = await recordPayment(
      { workspaceId, role: "OWNER", userId },
      {
        customerId,
        invoiceId,
        cashBankAccountId,
        amount: 30,
        allocations: [{ invoiceId, amount: 30 }],
        paymentDate: new Date(),
        method: "CASH",
        reference: "QA-REVERSAL",
        notes: "Standalone receipt",
        idempotencyKey: randomUUID(),
      },
    );
    paymentId = recorded.id;

    const reversal = await reverseCustomerPayment({ workspaceId, role: "OWNER", userId }, paymentId, "Duplicate receipt");
    expect(reversal.alreadyReversed).toBe(false);

    const [original, reversalPayment, customer, invoice, sale, cash, ledgerRows, glRows] = await Promise.all([
      db.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      db.payment.findUniqueOrThrow({ where: { id: reversal.id } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: saleId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.ledgerEntry.findMany({ where: { workspaceId, customerId }, orderBy: { createdAt: "asc" } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, OR: [{ sourceId: paymentId }, { reversalOfId: { not: null } }] } }),
    ]);

    expect(original.isReversed).toBe(true);
    expect(original.reversedAt).not.toBeNull();
    expect(reversalPayment.reversalOfId).toBe(paymentId);
    expect(Number(customer.currentBalance)).toBe(100);
    expect(Number(invoice.paidAmount)).toBe(0);
    expect(invoice.status).toBe("UNPAID");
    expect(Number(sale.paidAmount)).toBe(0);
    expect(Number(sale.balanceAmount)).toBe(100);
    expect(Number(cash.currentBalance)).toBe(0);
    expect(ledgerRows.some((row) => row.type === "PAYMENT_RECEIVED" && Number(row.credit) === 30)).toBe(true);
    expect(ledgerRows.some((row) => row.type === "REVERSAL" && Number(row.debit) === 30)).toBe(true);

    const debit = glRows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(debit).toBe(credit);

    const repeated = await reverseCustomerPayment({ workspaceId, role: "OWNER", userId }, paymentId, "Duplicate receipt");
    expect(repeated).toEqual({ id: reversal.id, alreadyReversed: true });
  }, 60_000);
});
