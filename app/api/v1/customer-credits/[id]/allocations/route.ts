import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { allocateCustomerCredit, CustomerCreditDomainError } from "@/lib/server/customer-credits";
import { customerCreditAllocationSchema } from "@/lib/validation/customer-credit";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = await params;
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, creditNoteId: id, idempotencyKey: key }) }), customerCreditAllocationSchema);
  try {
    return apiData(await allocateCustomerCredit({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof CustomerCreditDomainError) throw new ApiError(422, "CUSTOMER_CREDIT_REJECTED", error.message);
    throw error;
  }
});
