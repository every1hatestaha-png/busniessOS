import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let getSupplierSettlementTargets: typeof import("@/lib/server/suppliers")["getSupplierSettlementTargets"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let cashBankAccountId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("legacy supplier balance settlement", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ getSupplierSettlementTargets, recordSupplierPayment } = await import("@/lib/server/suppliers"));

    const user = await db.user.create({
      data: {
        clerkId: `legacy-supplier-${runId}`,
        email: `legacy-supplier-${runId}@example.invalid`,
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Legacy Supplier ${runId}`,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    await ensureDefaultAccounts(workspaceId);
    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true } });
    cashBankAccountId = cash.id;
    await db.cashBankAccount.update({ where: { id: cash.id }, data: { currentBalance: 500_000 } });

    // Simulate a supplier created by the older app version: the supplier balance
    // exists, but no persisted OPENING_BALANCE ledger row / GRN target exists.
    const supplier = await db.supplier.create({
      data: {
        workspaceId,
        name: "Legacy Balance Supplier",
        currentBalance: 100_000,
      },
    });
    supplierId = supplier.id;
  }, 30_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.paymentAllocation.deleteMany({ where: { workspaceId } });
    await db.payment.deleteMany({ where: { workspaceId } });
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("exposes an unattributed historical payable as opening balance and lets it be partially settled", async () => {
    const before = await getSupplierSettlementTargets(workspaceId, supplierId);
    expect(before?.currentBalance).toBe(100_000);
    expect(before?.grns).toHaveLength(0);
    expect(before?.openingBalance.originalAmount).toBe(100_000);
    expect(before?.openingBalance.settledAmount).toBe(0);
    expect(before?.openingBalance.outstandingAmount).toBe(100_000);

    const payment = await recordSupplierPayment(context(), supplierId, {
      cashBankAccountId,
      amount: 40_000,
      withholdingTaxAmount: 0,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "LEGACY-OPENING-PARTIAL",
      allocations: [{ openingBalance: true, amount: 40_000 }],
      idempotencyKey: `legacy-opening-payment-${runId}`,
    });

    const allocation = await db.paymentAllocation.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(allocation.isSupplierOpeningBalance).toBe(true);
    expect(allocation.goodReceivedNoteId).toBeNull();
    expect(allocation.purchaseOrderId).toBeNull();

    const after = await getSupplierSettlementTargets(workspaceId, supplierId);
    expect(after?.currentBalance).toBe(60_000);
    expect(after?.openingBalance.originalAmount).toBe(100_000);
    expect(after?.openingBalance.settledAmount).toBe(40_000);
    expect(after?.openingBalance.outstandingAmount).toBe(60_000);
  });
});
