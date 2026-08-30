import { z } from "zod";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getGoodsReceipt } from "@/lib/server/purchases";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const grn = await getGoodsReceipt(context.workspaceId, id);
  if (!grn) throw new ApiError(404, "NOT_FOUND", "Goods receipt not found.");
  return apiData(grn);
});
