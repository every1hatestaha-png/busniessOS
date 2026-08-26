import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("business.read");
  return apiData({ ...context.user, role: context.role });
});
