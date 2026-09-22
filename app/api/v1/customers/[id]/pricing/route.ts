import { z } from "zod";

import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { listCustomerPriceRules } from "@/lib/server/customer-pricing";
import { db } from "@/lib/server/db";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("sales.create");
  const { id } = paramsSchema.parse(await params);
  const customer = await db.customer.findFirst({
    where: { id, workspaceId: context.workspaceId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!customer) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
  return apiData({ rules: await listCustomerPriceRules(context.workspaceId, customer.id) });
});
