import "server-only";

import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/server/db";

export const getCurrentUser = cache(async () => {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  const requestHeaders = await headers();
  const isElectron = (requestHeaders.get("user-agent") || "").includes("Electron");

  if (!userId) {
    redirect(isElectron ? "/desktop-auth" : "/sign-in");
  }

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    return existing;
  }

  // Resolve the authenticated Clerk identity from the backend. This also lets
  // us safely reconnect an existing MunshiOS user if Clerk ever issues a new
  // user ID for the same verified email address.
  const clerkUser = await (await clerkClient()).users.getUser(userId);

  const primaryEmailAddress =
    clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];

  const primaryEmail = primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!primaryEmail) {
    throw new Error("Your Clerk account needs an email address before using MunshiOS.");
  }

  if (primaryEmailAddress?.verification?.status !== "verified") {
    throw new Error("Verify your email address before using MunshiOS.");
  }

  // Email is unique in MunshiOS. If a verified Clerk identity with the same
  // email appears under a new Clerk ID, reconnect it to the existing local
  // user instead of creating an empty account and orphaning workspace data.
  const existingByEmail = await db.user.findUnique({ where: { email: primaryEmail } });
  if (existingByEmail) {
    return db.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkId: userId,
        email: primaryEmail,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
    });
  }

  return db.user.create({
    data: {
      clerkId: userId,
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
    },
  });
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
  return memberships.map((membership) => ({
    workspaceId: membership.workspaceId,
    role: membership.role,
    workspace: { name: membership.workspace.name },
  }));
}

export async function requireWorkspace() {
  const context = await getCurrentWorkspace();
  if (!context) {
    redirect("/onboarding");
  }
  return context;
}
