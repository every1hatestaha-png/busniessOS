import { getSale } from "@/lib/server/sales";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const { workspaceId } = await requireApiContext("business.read");
  const { id } = await route.params;
  const sale = await getSale(workspaceId, id);
  if (!sale) throw new ApiError(404, "SALE_NOT_FOUND", "Sale not found.");
  return apiData(sale);
});
