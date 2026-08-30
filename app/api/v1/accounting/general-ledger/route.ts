import { AccountingDomainError, getGeneralLedger } from "@/lib/server/accounting";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { ledgerReportSchema } from "@/lib/validation/accounting";

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const url = new URL(request.url);
  const parsed = ledgerReportSchema.parse({ accountId: url.searchParams.get("accountId"), from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  try {
    return apiData(await getGeneralLedger(context.workspaceId, parsed));
  } catch (error) {
    if (error instanceof AccountingDomainError) throw new ApiError(404, "ACCOUNT_NOT_FOUND", error.message);
    throw error;
  }
});
