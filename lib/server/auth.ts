import "server-only";

import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/server/db";
import { getSupabaseAuthUser } from "@/lib/supabase/server";

type AuthIdentity = {
  provider: "supabase" | "clerk";
  providerUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

const getCurrentIdentity = cache(async (): Promise<AuthIdentity | null> => {
  const supabaseUser = await getSupabaseAuthUser();
  if (supabaseUser) {
    const email = supabaseUser.email?.trim().toLowerCase();
    if (!email || !supabaseUser.email_confirmed_at) return null;
    return {
      provider: "supabase",
      providerUserId: supabaseUser.id,
      email,
      firstName: typeof supabaseUser.user_metadata?.first_name === "string" ? supabaseUser.user_metadata.first_name : null,
      lastName: typeof supabaseUser.user_metadata?.last_name === "string" ? supabaseUser.user_metadata.last_name : null,
    };
  }

  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const clerkUserId = "userId" in session ? session.userId : null;
  if (!clerkUserId) return null;

  const clerkUser = await (await clerkClient()).users.getUser(clerkUserId);
  const primaryEmailAddress = clerkUser.primaryEmailAddressId
    ? clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)
    : undefined;
  const email = primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!email || primaryEmailAddress?.verification?.status !== "verified") return null;

  return {
    provider: "clerk",
    providerUserId: clerkUserId,
    email,
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
  };
});

async function resolveLocalUser(identity: AuthIdentity) {
  if (identity.provider === "clerk") {
    const existing = await db.user.findUnique({ where: { clerkId: identity.providerUserId } });
    if (existing) {
      if (
        existing.email === identity.email
        && existing.firstName === identity.firstName
        && existing.lastName === identity.lastName
      ) {
        return existing;
      }
      const conflictingEmailOwner = await db.user.findUnique({ where: { email: identity.email } });
      if (conflictingEmailOwner && conflictingEmailOwner.id !== existing.id) {
        throw new Error("This verified email is already linked to another MunshiOS user.");
      }
      return db.user.update({
        where: { id: existing.id },
        data: { email: identity.email, firstName: identity.firstName, lastName: identity.lastName },
      });
    }
  }

  const existingByEmail = await db.user.findUnique({ where: { email: identity.email } });
  if (existingByEmail) {
    return db.user.update({
      where: { id: existingByEmail.id },
      data: {
        ...(identity.provider === "clerk" ? { clerkId: identity.providerUserId } : {}),
        firstName: identity.firstName ?? existingByEmail.firstName,
        lastName: identity.lastName ?? existingByEmail.lastName,
      },
    });
  }

  if (identity.provider === "supabase") {
    throw new Error("This Supabase account is not linked to a MunshiOS user yet. Complete signup or contact support.");
  }

  return db.user.create({
    data: {
      clerkId: identity.providerUserId,
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
    },
  });
}

export const getOptionalCurrentUser = cache(async () => {
  const identity = await getCurrentIdentity();
  return identity ? resolveLocalUser(identity) : null;
});

export const getCurrentUser = cache(async () => {
  const user = await getOptionalCurrentUser();
  if (!user) {
    const requestHeaders = await headers();
    const isElectron = (requestHeaders.get("user-agent") || "").includes("Electron");
    redirect(isElectron ? "/desktop-auth" : "/sign-in");
  }
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
  const user = await getOptionalCurrentUser();
  if (!user) return null;

  const activeWorkspaceId = (await cookies()).get("businessos_workspace")?.value;
  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true, workspace: true },
  });
  const membership = memberships.find((entry) => entry.workspaceId === activeWorkspaceId) ?? memberships[0];
  if (!membership) return null;

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
  if (!context) redirect("/onboarding");
  return context;
}
