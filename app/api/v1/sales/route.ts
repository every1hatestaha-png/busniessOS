import { createSale, listSales, SaleDomainError } from "@/lib/server/sales";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";
import { saleSchema } from "@/lib/validation/sale";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("business.read");
  const sales = await listSales(context.workspaceId);
  if (canPerformAction(context.role, "financial.manage")) return apiData(sales);

  return apiData(sales.map((sale) => ({
    ...sale,
    customer: {
      id: sale.customer.id,
      name: sale.customer.name,
      companyName: sale.customer.companyName,
      phone: sale.customer.phone,
      address: sale.customer.address,
    },
  })));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("sales.create");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, idempotencyKey: key }),
    }),
    saleSchema,
  );
  try {
    return apiData(await createSale({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof SaleDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});
