import { z } from "zod";
import { CustomerDomainError, getCustomer, removeCustomer, updateCustomer } from "@/lib/server/customers";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { customerEditSchema } from "@/lib/validation/customer";

type RouteContext = { params: Promise<{ id: string }> };
const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const { workspaceId } = await requireApiContext("business.read");
  const { id } = paramsSchema.parse(await route.params);
  const customer = await getCustomer(workspaceId, id);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return apiData(customer);
});

export const PATCH = apiHandler(async (request: Request, route: RouteContext) => {
  const context = await requireApiContext("customers.write");
  const { id } = paramsSchema.parse(await route.params);
  try {
    await updateCustomer({ ...context, userId: context.user.id }, id, await parseApiBody(request, customerEditSchema));
    return apiData(await getCustomer(context.workspaceId, id));
  } catch (error) {
    if (error instanceof CustomerDomainError) throw new ApiError(error.code === "CUSTOMER_NOT_FOUND" ? 404 : 422, error.code, error.message);
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, route: RouteContext) => {
  const context = await requireApiContext("customers.write");
  const { id } = paramsSchema.parse(await route.params);
  try {
    return apiData(await removeCustomer({ ...context, userId: context.user.id }, id));
  } catch (error) {
    if (error instanceof CustomerDomainError) throw new ApiError(error.code === "CUSTOMER_NOT_FOUND" ? 404 : 422, error.code, error.message);
    throw error;
  }
});
