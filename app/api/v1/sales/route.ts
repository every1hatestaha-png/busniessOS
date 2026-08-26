import { createSale, listSales, SaleDomainError } from "@/lib/server/sales";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { saleSchema } from "@/lib/validation/sale";

export const GET = apiHandler(async () => {
  const { workspaceId } = await requireApiContext("business.read");
  return apiData(await listSales(workspaceId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("sales.create");
  const input = await parseApiBody(request, saleSchema);
  try {
    return apiData(await createSale(context, input), 201);
  } catch (error) {
    if (error instanceof SaleDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});
