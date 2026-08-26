import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { inviteMember, listInvitations, listMembers, MemberDomainError } from "@/lib/server/members";
export const GET = apiHandler(async () => { const context = await requireApiContext("members.manage"); const [members, invitations] = await Promise.all([listMembers(context.workspaceId), listInvitations(context.workspaceId)]); return apiData({ members, invitations }); });
export const POST = apiHandler(async (request: Request) => { const context = await requireApiContext("members.manage"); const body = await parseApiBody(request, z.object({ email: z.email(), role: z.enum(["ADMIN", "MANAGER", "STAFF"]) })); try { return apiData(await inviteMember({ ...context, userId: context.user.id }, body.email, body.role), 201); } catch (error) { if (error instanceof MemberDomainError) throw new ApiError(422, "MEMBER_ERROR", error.message); throw error; } });
