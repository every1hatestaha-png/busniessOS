import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getProduct } from "@/lib/server/products";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const { workspaceId } = await requireApiContext("business.read");
  const { id } = await route.params;
  const product = await getProduct(id, workspaceId);
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return apiData(product);
});
