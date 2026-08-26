import { z } from "zod";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getPurchase } from "@/lib/server/purchases";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const purchase = await getPurchase(context.workspaceId, id);
  if (!purchase) throw new ApiError(404, "NOT_FOUND", "Purchase not found.");
  return apiData(purchase);
});
