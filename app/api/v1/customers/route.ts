import { createCustomer, listCustomers } from "@/lib/server/customers";
import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { customerSchema } from "@/lib/validation/customer";

export const GET = apiHandler(async () => {
  const { workspaceId } = await requireApiContext("business.read");
  return apiData(await listCustomers(workspaceId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("customers.write");
  const input = await parseApiBody(request, customerSchema);
  const id = await createCustomer({ ...context, userId: context.user.id }, input);
  return apiData({ id }, 201);
});
