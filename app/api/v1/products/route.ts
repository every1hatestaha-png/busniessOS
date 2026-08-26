import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { productSchema } from "@/lib/validation/product";
import { createProduct, listProducts } from "@/lib/server/products";

export const GET = apiHandler(async () => {
  const { workspaceId } = await requireApiContext("business.read");
  return apiData(await listProducts(workspaceId));
});

export const POST = apiHandler(async (request: Request) => {
  const { workspaceId } = await requireApiContext("products.write");
  const input = await parseApiBody(request, productSchema);
  const id = await createProduct(workspaceId, input);
  return apiData({ id }, 201);
});
