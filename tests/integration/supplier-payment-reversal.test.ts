import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let reverseSupplierPayment: typeof import("@/lib/server/supplier-payment-reversals")["reverseSupplierPayment"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let purchaseOrderId = "";
let cashBankAccountId = "";

describe("supplier payment reversal", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ reverseSupplierPayment } = await import("@/lib/server/supplier-payment-reversals"));

    const user = await db.user.create({ data: { clerkId: `supplier-payment-reversal-${runId}`, email: `supplier-payment-reversal-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Supplier reversal ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);

    const supplier = await db.supplier.create({ data: { workspaceId, name: "Reversal Supplier", currentBalance: 100 } });
    supplierId = supplier.id;
    const purchase = await db.purchaseOrder.create({ data: { workspaceId, supplierId, orderNumber: `PO-REV-${runId}`, status: "ORDERED", totalAmount: 100, paidAmount: 0, balanceAmount: 100 } });
    purchaseOrderId = purchase.id;
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false } });
    cashBankAccountId = cash.id;
    await db.cashBankAccount.update({ where: { id: cashBankAccountId }, data: { currentBalance: 1000 } });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("reverses gross payable settlement, WHT, net cash and purchase allocation", async () => {
    const payment = await recordSupplierPayment(
      { workspaceId, role: "OWNER", userId },
      supplierId,
      {
        amount: 100,
        withholdingTaxAmount: 20,
        cashBankAccountId,
        method: "BANK_TRANSFER",
        reference: "QA-SUP-REV",
        notes: "Supplier payment reversal test",
        paymentDate: new Date(),
        allocations: [{ purchaseOrderId, amount: 100 }],
        idempotencyKey: randomUUID(),
      },
    );

    const reversal = await reverseSupplierPayment({ workspaceId, role: "OWNER", userId }, payment.id, "Duplicate supplier voucher");
    expect(reversal.alreadyReversed).toBe(false);

    const [original, reversalPayment, supplier, purchase, cash, ledgerRows, glRows] = await Promise.all([
      db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      db.payment.findUniqueOrThrow({ where: { id: reversal.id } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.ledgerEntry.findMany({ where: { workspaceId, supplierId }, orderBy: { createdAt: "asc" } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, OR: [{ sourceId: payment.id }, { reversalOfId: { not: null } }] } }),
    ]);

    expect(original.isReversed).toBe(true);
    expect(reversalPayment.reversalOfId).toBe(payment.id);
    expect(Number(reversalPayment.amount)).toBe(100);
    expect(Number(reversalPayment.withholdingTaxAmount)).toBe(20);
    expect(Number(reversalPayment.netAmount)).toBe(80);
    expect(Number(supplier.currentBalance)).toBe(100);
    expect(Number(purchase.paidAmount)).toBe(0);
    expect(Number(purchase.balanceAmount)).toBe(100);
    expect(Number(cash.currentBalance)).toBe(1000);
    expect(ledgerRows.some((row) => row.type === "PAYMENT_MADE" && Number(row.debit) === 100)).toBe(true);
    expect(ledgerRows.some((row) => row.type === "REVERSAL" && Number(row.credit) === 100)).toBe(true);

    const debit = glRows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(debit).toBe(credit);

    const repeated = await reverseSupplierPayment({ workspaceId, role: "OWNER", userId }, payment.id, "Duplicate supplier voucher");
    expect(repeated).toEqual({ id: reversal.id, alreadyReversed: true });
  }, 60_000);
});
