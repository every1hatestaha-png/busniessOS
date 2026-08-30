import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getProfitAndLoss } from "@/lib/server/accounting";
import { profitLossSchema } from "@/lib/validation/accounting";

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const url = new URL(request.url);
  const parsed = profitLossSchema.parse({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  return apiData(await getProfitAndLoss(context.workspaceId, parsed));
});
