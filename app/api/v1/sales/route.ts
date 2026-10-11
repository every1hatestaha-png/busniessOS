import { NextResponse } from "next/server";
import { createSale, listSalesPage, SaleDomainError } from "@/lib/server/sales";
import { SalesCursorError, salesPageOptions } from "@/lib/sales-pagination";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { saleSchema } from "@/lib/validation/sale";

export const GET = apiHandler(async (request: Request) => {
  const { workspaceId } = await requireApiContext("business.read");
  try {
    return NextResponse.json(await listSalesPage(workspaceId, salesPageOptions(new URL(request.url).searchParams)));
  } catch (error) {
    if (error instanceof SalesCursorError) throw new ApiError(422, "INVALID_CURSOR", error.message);
    throw error;
  }
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("sales.create");
  const body = await request.json();
  const input = saleSchema.parse({ ...body, idempotencyKey: request.headers.get("Idempotency-Key") ?? body.idempotencyKey });
  try {
    return apiData(await createSale({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof SaleDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});
