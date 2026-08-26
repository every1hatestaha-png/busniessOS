import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { db } from "@/lib/server/db";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext();
  const { workspaceId } = await parseApiBody(request, z.object({ workspaceId: z.uuid() }));
  const membership = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: context.user.id } } });
  if (!membership) throw new ApiError(403, "NOT_A_MEMBER", "You are not a member of that workspace.");
  (await cookies()).set("businessos_workspace", workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return apiData({ workspaceId });
});
