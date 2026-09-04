import { z } from "zod";

import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { getProduct, ProductDomainError, removeProduct, updateProduct } from "@/lib/server/products";
import { productEditSchema } from "@/lib/validation/product";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = paramsSchema.parse(await params);
  const product = await getProduct(id, context.workspaceId);
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return apiData(product);
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("products.write");
  const { id } = paramsSchema.parse(await params);
  try {
    await updateProduct({ ...context, userId: context.user.id }, id, await parseApiBody(request, productEditSchema));
    return apiData(await getProduct(id, context.workspaceId));
  } catch (error) {
    if (error instanceof ProductDomainError) throw new ApiError(error.code === "PRODUCT_NOT_FOUND" ? 404 : 422, error.code, error.message);
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("products.write");
  const { id } = paramsSchema.parse(await params);
  try {
    return apiData(await removeProduct({ ...context, userId: context.user.id }, id));
  } catch (error) {
    if (error instanceof ProductDomainError) throw new ApiError(error.code === "PRODUCT_NOT_FOUND" ? 404 : 422, error.code, error.message);
    throw error;
  }
});
