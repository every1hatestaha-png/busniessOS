import { AccountingDomainError, createExpense } from "@/lib/server/accounting";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { expenseSchema } from "@/lib/validation/accounting";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const body = await request.clone().json().catch(() => ({}));
  const key = request.headers.get("Idempotency-Key");
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key ?? body.idempotencyKey }) }), expenseSchema);
  try {
    return apiData(await createExpense({ workspaceId: context.workspaceId, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof AccountingDomainError) throw new ApiError(422, "ACCOUNTING_REJECTED", error.message);
    throw error;
  }
});
