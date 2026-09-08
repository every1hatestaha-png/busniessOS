import { z } from "zod";

import { ApiError, apiHandler, requireApiContext } from "@/lib/server/api";
import { MemberDomainError, revokeInvitation } from "@/lib/server/members";

const paramsSchema = z.object({ id: z.uuid() });

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("members.manage");
  const { id } = paramsSchema.parse(await params);
  try {
    await revokeInvitation({ ...context, userId: context.user.id }, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MemberDomainError) throw new ApiError(409, "INVITATION_NOT_PENDING", error.message);
    throw error;
  }
});
