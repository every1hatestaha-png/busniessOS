import { z } from "zod";

import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getSupplierSettlementTargets } from "@/lib/server/suppliers";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const targets = await getSupplierSettlementTargets(context.workspaceId, id);
  if (!targets) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
  return apiData(targets);
});
