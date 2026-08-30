import { AccountingDomainError, createCashBankAccount, getCashBankAccounts } from "@/lib/server/accounting";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { cashBankAccountSchema } from "@/lib/validation/accounting";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("financial.manage");
  return apiData(await getCashBankAccounts(context.workspaceId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const input = await parseApiBody(request, cashBankAccountSchema);
  try {
    return apiData(await createCashBankAccount({ workspaceId: context.workspaceId, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof AccountingDomainError) throw new ApiError(422, "ACCOUNTING_REJECTED", error.message);
    throw error;
  }
});
