import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createExpense: typeof import("@/lib/server/accounting")["createExpense"];
let reverseExpense: typeof import("@/lib/server/expense-reversals")["reverseExpense"];
let getExpenseReversalState: typeof import("@/lib/server/expense-reversals")["getExpenseReversalState"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let cashBankId = "";
let paymentAccountId = "";
let expenseAccountId = "";

describe("expense reversal", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts, createExpense } = await import("@/lib/server/accounting"));
    ({ reverseExpense, getExpenseReversalState } = await import("@/lib/server/expense-reversals"));

    const user = await db.user.create({ data: { clerkId: `expense-reversal-${runId}`, email: `expense-reversal-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Expense reversal ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);

    const [cash, expenseAccount] = await Promise.all([
      db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isBank: false }, include: { account: true } }),
      db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "OFFICE_EXPENSE" } } }),
    ]);
    cashBankId = cash.id;
    paymentAccountId = cash.accountId;
    expenseAccountId = expenseAccount.id;
    await db.cashBankAccount.update({ where: { id: cashBankId }, data: { currentBalance: 100 } });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("reverses GL and restores cash without deleting the original expense", async () => {
    const expense = await createExpense(
      { workspaceId, role: "OWNER", userId },
      {
        expenseAccountId,
        paymentAccountId,
        amount: 25,
        expenseDate: new Date(),
        payee: "QA Payee",
        reference: "QA-EXP-REV",
        notes: "Expense reversal test",
        idempotencyKey: randomUUID(),
      },
    );

    expect(Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankId } })).currentBalance)).toBe(75);
    expect((await getExpenseReversalState(workspaceId, expense.id))?.isReversed).toBe(false);

    const reversed = await reverseExpense({ workspaceId, role: "OWNER", userId }, expense.id, "Duplicate voucher");
    expect(reversed.alreadyReversed).toBe(false);

    const [persistedExpense, cash, glRows, state] = await Promise.all([
      db.expense.findUniqueOrThrow({ where: { id: expense.id } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankId } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, OR: [{ sourceId: expense.id }, { reversalOfId: { not: null } }] } }),
      getExpenseReversalState(workspaceId, expense.id),
    ]);

    expect(persistedExpense.id).toBe(expense.id);
    expect(Number(cash.currentBalance)).toBe(100);
    expect(state).toMatchObject({ isReversed: true, reversalDocumentNo: `REV-${persistedExpense.voucherNumber}` });
    expect(glRows.filter((row) => row.sourceType === "EXPENSE" && !row.reversalOfId)).toHaveLength(2);
    expect(glRows.filter((row) => row.sourceType === "REVERSAL" && row.reversalOfId)).toHaveLength(2);
    const debit = glRows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(debit).toBe(credit);

    const repeated = await reverseExpense({ workspaceId, role: "OWNER", userId }, expense.id, "Duplicate voucher");
    expect(repeated.alreadyReversed).toBe(true);
    expect(Number((await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankId } })).currentBalance)).toBe(100);
  }, 60_000);
});
