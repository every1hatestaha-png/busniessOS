import { createCustomer, listCustomers } from "@/lib/server/customers";
import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { canPerformAction } from "@/lib/server/authorization";
import { customerSchema } from "@/lib/validation/customer";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("business.read");
  const customers = await listCustomers(context.workspaceId);

  if (canPerformAction(context.role, "financial.manage")) {
    return apiData(customers);
  }

  return apiData(customers.map(({ creditDays: _creditDays, creditLimit: _creditLimit, currentBalance: _currentBalance, ...customer }) => customer));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("customers.write");
  const input = await parseApiBody(request, customerSchema);
  const id = await createCustomer({ ...context, userId: context.user.id }, input);
  return apiData({ id }, 201);
});