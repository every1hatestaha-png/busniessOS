import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { createSupplier, listSuppliers } from "@/lib/server/suppliers";
import { supplierSchema } from "@/lib/validation/supplier";

export const GET = apiHandler(async () => { const context = await requireApiContext("business.read"); return apiData(await listSuppliers(context.workspaceId)); });
export const POST = apiHandler(async (request: Request) => { const context = await requireApiContext("financial.manage"); const input = await parseApiBody(request, supplierSchema); return apiData(await createSupplier({ ...context, userId: context.user.id }, input), 201); });
