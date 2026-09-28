import { z } from "zod";
import { CustomerDomainError, getCustomer, removeCustomer, updateCustomer } from "@/lib/server/customers";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";
import { customerEditSchema } from "@/lib/validation/customer";

type RouteContext = { params: Promise<{ id: string }> };
const paramsSchema = z.object({ id: z.uuid() });

function customerResponseForRole(customer: NonNullable<Awaited<ReturnType<typeof getCustomer>>>, canViewFinancials: boolean) {
  if (canViewFinancials) return customer;
  return {
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName,
    phone: customer.phone,
    email: customer.email,
    city: customer.city,
    address: customer.address,
    province: customer.province,
    registrationType: customer.registrationType,
    status: customer.status,
  };
}

export const GET = apiHandler(async (_request: Request, route: RouteContext) => {
  const context = await requireApiContext("business.read");
  const { id } = paramsSchema.parse(await route.params);
  const customer = await getCustomer(context.workspaceId, id);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return apiData(customerResponseForRole(customer, canPerformAction(context.role, "financial.manage")));
});

export const PATCH = apiHandler(async (request: Request, route: RouteContext) => {
  const context = await requireApiContext("customers.write");
  const { id } = paramsSchema.parse(await route.params);
  try {
    await updateCustomer({ ...context, userId: context.user.id }, id, await parseApiBody(request, customerEditSchema));
    const customer = await getCustomer(context.workspaceId, id);
    return apiData(customer ? customerResponseForRole(customer, canPerformAction(context.role, "financial.manage")) : null);
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