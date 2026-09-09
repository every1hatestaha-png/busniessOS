import "server-only";

import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/server/db";

export const getCurrentUser = cache(async () => {
  console.info("[D4][root] before currentUser");
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  const tokenType = "tokenType" in session ? session.tokenType : "none";
  const requestHeaders = await headers();
  const isElectron = (requestHeaders.get("user-agent") || "").includes("Electron");

  console.info(`[D4][auth] auth().userId present=${userId ? "YES" : "NO"} tokenType=${tokenType}`);

  if (!userId) {
    console.info("[D4][auth] BusinessOS user found=NO");
    console.info("[D4][workspace] workspace found=NO");
    redirect(isElectron ? "/desktop-auth" : "/sign-in");
  }

  console.info("[D4][root] after currentUser");
  console.info("[D4][auth] DB user query started");
  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    console.info("[D4][auth] BusinessOS user found=YES");
    return existing;
  }

  // currentUser() uses the default session-token mode in the installed SDK.
  // Use the canonical user ID from auth() and the backend client so OAuth
  // bearer requests can provision the local BusinessOS user correctly.
  const clerkUser = await (await clerkClient()).users.getUser(userId);
  console.info("[D4][auth] BusinessOS user found=NO; provisioning from Clerk");

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

  console.info("[D4][auth] BusinessOS user found=YES");
  return user;
});

const getCurrentUserWorkspaceMemberships = cache(async () => {
  console.info("[D4][root] before workspace lookup");
  const user = await getCurrentUser();
  console.info("[D4][root] after currentUser");
  const activeWorkspaceId = (await cookies()).get("businessos_workspace")?.value;
  console.info("[D4][workspace] workspace query started");
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
    console.info("[D4][workspace] workspace found=NO");
    console.info("[D4][root] after workspace lookup");
    return null;
  }

  console.info(`[D4][workspace] workspace found=YES members=${memberships.length}`);
  console.info("[D4][root] after workspace lookup");

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
  console.info("[D4][root] requireWorkspace entered");
  const context = await getCurrentWorkspace();
  if (!context) {
    console.info("[D4][root] requireWorkspace redirecting to /onboarding");
    redirect("/onboarding");
  }
  console.info("[D4][root] requireWorkspace resolved");
  return context;
}
