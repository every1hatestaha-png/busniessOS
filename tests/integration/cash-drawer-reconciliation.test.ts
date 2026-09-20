import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let recordCashDrawerReconciliation: typeof import("@/lib/server/cash-reconciliation")["recordCashDrawerReconciliation"];
let listCashDrawerReconciliations: typeof import("@/lib/server/cash-reconciliation")["listCashDrawerReconciliations"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let cashId = "";
let bankId = "";

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("cash drawer reconciliation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts, createCashBankAccount } = await import("@/lib/server/accounting"));
    ({ recordCashDrawerReconciliation, listCashDrawerReconciliations } = await import("@/lib/server/cash-reconciliation"));

    const user = await db.user.create({ data: { clerkId: `cash-count-${runId}`, email: `cash-count-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Cash Count ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);

    const cash = await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false } });
    cashId = cash.id;
    await db.cashBankAccount.update({ where: { id: cashId }, data: { currentBalance: 500 } });

    const bankAccount = await createCashBankAccount(context(), {
      name: "Reconciliation Bank",
      openingBalance: 0,
      isBank: true,
      bankName: "Test Bank",
      accountTitle: "MunshiOS",
      accountNumber: "123",
      notes: "",
    });
    bankId = (await db.cashBankAccount.findUniqueOrThrow({ where: { workspaceId_accountId: { workspaceId, accountId: bankAccount.id } } })).id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("records counted cash and variance without changing the ledger balance", async () => {
    const result = await recordCashDrawerReconciliation(context(), cashId, {
      countedAmount: 480,
      notes: "Closing shift count",
    });
    expect(result).toMatchObject({ expectedAmount: 500, countedAmount: 480, difference: -20 });

    const [cash, history, audit] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
      listCashDrawerReconciliations(workspaceId, cashId),
      db.auditLog.findFirstOrThrow({ where: { workspaceId, entityId: cashId, action: "cash_drawer.reconciled" } }),
    ]);
    expect(Number(cash.currentBalance)).toBe(500);
    expect(history[0]).toMatchObject({ expectedAmount: 500, countedAmount: 480, difference: -20, notes: "Closing shift count" });
    expect(audit.actorId).toBe(userId);
  });

  it("does not allow physical drawer counts against bank accounts", async () => {
    await expect(recordCashDrawerReconciliation(context(), bankId, { countedAmount: 1, notes: "" }))
      .rejects.toThrow("Active cash account not found");
  });
});
