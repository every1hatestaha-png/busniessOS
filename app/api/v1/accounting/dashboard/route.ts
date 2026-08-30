import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getFinancialDashboard } from "@/lib/server/accounting";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("financial.manage");
  return apiData(await getFinancialDashboard(context.workspaceId));
});
