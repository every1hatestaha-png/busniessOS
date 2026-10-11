import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { MemberDomainError, removeMember, updateMemberRole, updateMemberRestaurantStation } from "@/lib/server/members";
const paramsSchema = z.object({ id: z.uuid() });
const memberPatchSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).optional(),
  restaurantStation: z.enum(["ALL", "POS", "KITCHEN"]).optional(),
}).refine((input) => Boolean(input.role) !== Boolean(input.restaurantStation), {
  message: "Supply either a role or restaurant station.",
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("members.manage");
  const { id } = paramsSchema.parse(await params);
  const body = await parseApiBody(request, memberPatchSchema);
  try {
    const updated = body.role
      ? await updateMemberRole({ ...context, userId: context.user.id }, id, body.role)
      : await updateMemberRestaurantStation({ ...context, userId: context.user.id }, id, body.restaurantStation!);
    return apiData(updated);
  } catch (error) {
    if (error instanceof MemberDomainError) throw new ApiError(422, "MEMBER_ERROR", error.message);
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => { const context = await requireApiContext("members.manage"); const { id } = paramsSchema.parse(await params); try { await removeMember({ ...context, userId: context.user.id }, id); return new Response(null, { status: 204 }); } catch (error) { if (error instanceof MemberDomainError) throw new ApiError(422, "MEMBER_ERROR", error.message); throw error; } });
