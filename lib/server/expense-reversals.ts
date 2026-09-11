import "server-only";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";

export class ExpenseReversalError extends Error {}

export async function getExpenseReversalState(workspaceId: string, expenseId: string) {
  const expense = await db.expense.findFirst({ where: { id: expenseId, workspaceId }, select: { id: true } });
  if (!expense) return null;
  const reversal = await db.generalLedgerEntry.findFirst({
    where: {
      workspaceId,
      sourceType: "REVERSAL",
      reversalOf: { workspaceId, sourceType: "EXPENSE", sourceId: expenseId },
    },
    orderBy: { createdAt: "asc" },
    select: { date: true, documentNo: true, reversalReason: true },
  });
  return {
    isReversed: Boolean(reversal),
    reversedAt: reversal?.date.toISOString() ?? null,
    reversalDocumentNo: reversal?.documentNo ?? null,
    reversalReason: reversal?.reversalReason ?? null,
  };
}

export async function reverseExpense(context: ServiceContext, expenseId: string, reason: string) {
  if (!canPerformAction(context.role, "financial.manage")) throw new ExpenseReversalError("Unauthorized");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new ExpenseReversalError("Provide a reversal reason between 3 and 500 characters.");

  return withSerializableRetry(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, workspaceId: context.workspaceId },
      select: { id: true, voucherNumber: true, amount: true, paymentAccountId: true },
    });
    if (!expense) throw new ExpenseReversalError("Expense not found.");

    const originals = await tx.generalLedgerEntry.findMany({
      where: { workspaceId: context.workspaceId, sourceType: "EXPENSE", sourceId: expense.id, reversalOfId: null },
      select: { id: true },
    });
    if (!originals.length) throw new ExpenseReversalError("Expense has no posted general-ledger entries to reverse.");

    const existing = await tx.generalLedgerEntry.findFirst({
      where: { workspaceId: context.workspaceId, reversalOfId: { in: originals.map((entry) => entry.id) } },
      select: { documentNo: true },
    });
    if (existing) return { id: expense.id, alreadyReversed: true as const, documentNo: existing.documentNo };

    const cashBank = await tx.cashBankAccount.findFirst({
      where: { workspaceId: context.workspaceId, accountId: expense.paymentAccountId, isActive: true },
      select: { id: true },
    });
    if (!cashBank) throw new ExpenseReversalError("The expense payment account is unavailable; automatic cash reversal is unsafe.");

    const now = new Date();
    const reversalDocumentNo = `REV-${expense.voucherNumber}`;
    const reversed = await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "EXPENSE", sourceId: expense.id }],
      documentNo: reversalDocumentNo,
      date: now,
      reason: `Reversed expense: ${cleanReason}`,
      reversedById: context.userId,
    });
    if (reversed.reversed === 0) throw new ExpenseReversalError("Expense could not be reversed because its GL entries are already reversed or missing.");

    await tx.cashBankAccount.update({
      where: { id: cashBank.id, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: expense.amount } },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "expense.reversed",
      entityType: "Expense",
      entityId: expense.id,
      metadata: { voucherNumber: expense.voucherNumber, reversalDocumentNo, reason: cleanReason, amount: expense.amount.toString() },
    });

    return { id: expense.id, alreadyReversed: false as const, documentNo: reversalDocumentNo };
  });
}
