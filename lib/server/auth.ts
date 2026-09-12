import "server-only";

import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/server/db";

export const getCurrentUser = cache(async () => {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  const tokenType = "tokenType" in session ? session.tokenType : "none";
  const requestHeaders = await headers();
  const isElectron = (requestHeaders.get("user-agent") || "").includes("Electron");


  if (!userId) {
    redirect(isElectron ? "/desktop-auth" : "/sign-in");
  }

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    return existing;
  }

  // currentUser() uses the default session-token mode in the installed SDK.
  // Use the canonical user ID from auth() and the backend client so OAuth
  // bearer requests can provision the local BusinessOS user correctly.
  const clerkUser = await (await clerkClient()).users.getUser(userId);

  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    throw new Error("Your Clerk account needs an email address before using BusinessOS.");
  }

  const user = await db.user.upsert({
    where: { clerkId: userId },
    create: {
      clerkId: userId,
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
    },
    update: {
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
    },
  });

  return user;
});

const getCurrentUserWorkspaceMemberships = cache(async () => {
  const user = await getCurrentUser();
  const activeWorkspaceId = (await cookies()).get("businessos_workspace")?.value;
  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true, workspace: true },
  });
  return { user, activeWorkspaceId, memberships };
});

export const getCurrentWorkspace = cache(async () => {
  const { user, activeWorkspaceId, memberships } = await getCurrentUserWorkspaceMemberships();
  const membership = memberships.find((entry) => entry.workspaceId === activeWorkspaceId) ?? memberships[0];

  if (!membership) {
    return null;
  }


  return {
    user,
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
});

export async function listCurrentUserWorkspaces() {
  const { memberships } = await getCurrentUserWorkspaceMemberships();
  return memberships.map((membership) => ({ workspaceId: membership.workspaceId, role: membership.role, workspace: { name: membership.workspace.name } }));
}

export async function requireWorkspace() {
  const context = await getCurrentWorkspace();
  if (!context) {
    redirect("/onboarding");
  }
  return context;
}
