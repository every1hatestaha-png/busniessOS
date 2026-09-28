import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";
import { productSchema } from "@/lib/validation/product";
import { createProduct, listProducts } from "@/lib/server/products";

function publicProduct(product: Awaited<ReturnType<typeof listProducts>>[number]) {
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

export const GET = apiHandler(async () => {
  const context = await requireApiContext("business.read");
  const products = await listProducts(context.workspaceId);
  return apiData(canPerformAction(context.role, "financial.manage") ? products : products.map(publicProduct));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("products.write");
  const input = await parseApiBody(request, productSchema);
  const id = await createProduct({ ...context, userId: context.user.id }, input);
  return apiData({ id }, 201);
});