import { z } from "zod";

import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";
import { getProduct, ProductDomainError, removeProduct, updateProduct } from "@/lib/server/products";
import { productEditSchema } from "@/lib/validation/product";

const paramsSchema = z.object({ id: z.uuid() });

function publicProduct(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>) {
  const {
    costPrice: _costPrice,
    fbrHsCode: _fbrHsCode,
    fbrUom: _fbrUom,
    fbrUomId: _fbrUomId,
    fbrTransactionTypeId: _fbrTransactionTypeId,
    fbrTransactionTypeDesc: _fbrTransactionTypeDesc,
    fbrRateId: _fbrRateId,
    fbrRateDesc: _fbrRateDesc,
    fbrRateValue: _fbrRateValue,
    fbrReferenceVerifiedAt: _fbrReferenceVerifiedAt,
    fbrReferenceVerifiedForDate: _fbrReferenceVerifiedForDate,
    fbrReferenceProvinceCode: _fbrReferenceProvinceCode,
    fbrReferenceProvinceDesc: _fbrReferenceProvinceDesc,
    fbrHsUomVerifiedAt: _fbrHsUomVerifiedAt,
    fbrHsUomAnnexureId: _fbrHsUomAnnexureId,
    ...safe
  } = product;
  return safe;
}

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = paramsSchema.parse(await params);
  const product = await getProduct(id, context.workspaceId);
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return apiData(canPerformAction(context.role, "financial.manage") ? product : publicProduct(product));
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("products.write");
  const { id } = paramsSchema.parse(await params);
  try {
    await updateProduct({ ...context, userId: context.user.id }, id, await parseApiBody(request, productEditSchema));
    const product = await getProduct(id, context.workspaceId);
    if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    return apiData(canPerformAction(context.role, "financial.manage") ? product : publicProduct(product));
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