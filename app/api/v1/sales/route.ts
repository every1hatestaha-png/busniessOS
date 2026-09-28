import { createSale, listSales, SaleDomainError } from "@/lib/server/sales";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { saleSchema } from "@/lib/validation/sale";

export const GET = apiHandler(async () => {
  const { workspaceId } = await requireApiContext("business.read");
  return apiData(await listSales(workspaceId));
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
