import "server-only";

import { db } from "@/lib/server/db";

export type ExpenseReplayRequest = {
  expenseAccountId: string;
  paymentAccountId: string;
  amount: number;
  expenseDate: Date;
  payee?: string | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
};

function sameNullableText(stored: string | null, requested: string | null | undefined) {
  return (stored ?? "") === (requested ?? "");
}

export async function expenseMatchesRequest(workspaceId: string, expenseId: string, request: ExpenseReplayRequest) {
  const expense = await db.expense.findFirst({
    where: { id: expenseId, workspaceId },
    select: {
      expenseAccountId: true,
      paymentAccountId: true,
      amount: true,
      expenseDate: true,
      payee: true,
      reference: true,
      notes: true,
      idempotencyKey: true,
    },
  });
  if (!expense) return false;

  return expense.expenseAccountId === request.expenseAccountId
    && expense.paymentAccountId === request.paymentAccountId
    && expense.amount.equals(request.amount)
    && expense.expenseDate.getTime() === request.expenseDate.getTime()
    && sameNullableText(expense.payee, request.payee)
    && sameNullableText(expense.reference, request.reference)
    && sameNullableText(expense.notes, request.notes)
    && (expense.idempotencyKey ?? null) === (request.idempotencyKey ?? null);
}
