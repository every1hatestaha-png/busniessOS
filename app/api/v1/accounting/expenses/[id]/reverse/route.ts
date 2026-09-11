import { z } from "zod";

import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { ExpenseReversalError, reverseExpense } from "@/lib/server/expense-reversals";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await parseApiBody(request, z.object({ reason: z.string().trim().min(3).max(500) }));

  try {
    return apiData(await reverseExpense({ ...context, userId: context.user.id }, id, body.reason));
  } catch (error) {
    if (error instanceof ExpenseReversalError) throw new ApiError(422, "EXPENSE_REVERSAL_REJECTED", error.message);
    throw error;
  }
});
