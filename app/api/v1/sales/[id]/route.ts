import { getSale } from "@/lib/server/sales";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const context = await requireApiContext("business.read");
  const { id } = await route.params;
  const sale = await getSale(context.workspaceId, id);
  if (!sale) throw new ApiError(404, "SALE_NOT_FOUND", "Sale not found.");

  if (canPerformAction(context.role, "financial.manage")) return apiData(sale);

  return apiData({
    ...sale,
    customer: {
      id: sale.customer.id,
      name: sale.customer.name,
      companyName: sale.customer.companyName,
      phone: sale.customer.phone,
      address: sale.customer.address,
    },
  });
});