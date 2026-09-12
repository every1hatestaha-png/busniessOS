import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { db } from "@/lib/server/db";
import { requirePlatformOwner } from "@/lib/server/subscriptions";

type WorkspaceMemberIdentity = {
  userId: string;
  email: string;
  clerkId: string;
};

export async function deleteCustomerWorkspaceAccount(
  workspaceId: string,
  confirmation: string,
) {
  await requirePlatformOwner();

  const workspaces = await db.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name"
    FROM "workspaces"
    WHERE "id" = ${workspaceId}
    LIMIT 1
  `;
  const workspace = workspaces[0];
  if (!workspace) throw new Error("Customer account not found.");

  if (confirmation.trim() !== workspace.name) {
    throw new Error("Type the exact business name to confirm deletion.");
  }

  const platformOwnerEmail = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const members = await db.$queryRaw<WorkspaceMemberIdentity[]>`
    SELECT DISTINCT u."id" AS "userId", u."email", u."clerkId"
    FROM "workspace_members" wm
    JOIN "users" u ON u."id" = wm."userId"
    WHERE wm."workspaceId" = ${workspaceId}
  `;

  if (platformOwnerEmail && members.some((member) => member.email.toLowerCase() === platformOwnerEmail)) {
    throw new Error("The platform owner account cannot be deleted from the control plane.");
  }

  // All business records reference workspaces with ON DELETE CASCADE.
  await db.$executeRaw`DELETE FROM "workspaces" WHERE "id" = ${workspaceId}`;

  // Remove identities that belonged only to the deleted customer account.
  // A user shared with another workspace is preserved.
  const clerk = await clerkClient();
  for (const member of members) {
    const remainingMemberships = await db.workspaceMember.count({ where: { userId: member.userId } });
    if (remainingMemberships > 0) continue;

    try {
      await clerk.users.deleteUser(member.clerkId);
    } catch {
      // Keep cleanup resilient: a missing/already-deleted Clerk identity should
      // not resurrect customer business data after the workspace is deleted.
    }

    await db.user.deleteMany({ where: { id: member.userId } });
  }

  return { workspaceId, workspaceName: workspace.name };
}
