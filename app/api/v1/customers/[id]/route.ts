import { getCustomer } from "@/lib/server/customers";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const { workspaceId } = await requireApiContext("business.read");
  const { id } = await route.params;
  const customer = await getCustomer(workspaceId, id);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return apiData(customer);
});
