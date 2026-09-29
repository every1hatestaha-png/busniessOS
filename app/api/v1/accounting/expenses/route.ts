import { AccountingDomainError, createExpense } from "@/lib/server/accounting";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { expenseMatchesRequest } from "@/lib/server/expense-idempotency";
import { expenseSchema } from "@/lib/validation/accounting";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("expenses.create");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), expenseSchema);
  try {
    const result = await createExpense({ workspaceId: context.workspaceId, userId: context.user.id }, input);
    if (!await expenseMatchesRequest(context.workspaceId, result.id, input)) {
      throw new ApiError(422, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different expense request.");
    }
    return apiData(result, 201);
  } catch (error) {
    if (error instanceof AccountingDomainError) throw new ApiError(422, "ACCOUNTING_REJECTED", error.message);
    throw error;
  }
});
