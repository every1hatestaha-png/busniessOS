import { getKhataSummary } from "@/lib/server/khata";
import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";

export const GET = apiHandler(async () => {
  const { workspaceId } = await requireApiContext("business.read");
  return apiData(await getKhataSummary(workspaceId));
});
