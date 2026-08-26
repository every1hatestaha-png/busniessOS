import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";

export const GET = apiHandler(async () => {
  const { workspace } = await requireApiContext("business.read");
  return apiData({
    ...workspace,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  });
});
