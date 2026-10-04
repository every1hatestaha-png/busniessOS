import "server-only";

import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/server/db";
import { getSupabaseAuthUser } from "@/lib/supabase/server";

const CLERK_SERVER_CONFIGURED = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type AuthIdentity = {
  provider: "supabase" | "clerk";
  providerUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

async function findLocalUserByEmail(email: string) {
  return db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });
}

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

  // A present-but-unverified Supabase identity must never silently fall through
  // to Clerk. That would let two auth providers disagree about the same browser.
  if (!CLERK_SERVER_CONFIGURED) return null;

  try {
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
  } catch {
    return null;
  }
});

async function resolveLocalUser(identity: AuthIdentity) {
  const existingByProvider = identity.provider === "supabase"
    ? await db.user.findUnique({ where: { supabaseId: identity.providerUserId } })
    : await db.user.findUnique({ where: { clerkId: identity.providerUserId } });

  if (existingByProvider) {
    const conflictingEmailOwner = await findLocalUserByEmail(identity.email);
    if (conflictingEmailOwner && conflictingEmailOwner.id !== existingByProvider.id) {
      throw new Error("This verified email is already linked to another MunshiOS user.");
    }

    if (
      existingByProvider.email === identity.email
      && (identity.firstName === null || existingByProvider.firstName === identity.firstName)
      && (identity.lastName === null || existingByProvider.lastName === identity.lastName)
    ) {
      return existingByProvider;
    }

    return db.user.update({
      where: { id: existingByProvider.id },
      data: {
        email: identity.email,
        firstName: identity.firstName ?? existingByProvider.firstName,
        lastName: identity.lastName ?? existingByProvider.lastName,
      },
    });
  }

  const existingByEmail = await findLocalUserByEmail(identity.email);
  if (existingByEmail) {
    if (identity.provider === "clerk") {
      return db.user.update({
        where: { id: existingByEmail.id },
        data: {
          clerkId: identity.providerUserId,
          email: identity.email,
          firstName: identity.firstName ?? existingByEmail.firstName,
          lastName: identity.lastName ?? existingByEmail.lastName,
        },
      });
    }

    if (existingByEmail.supabaseId && existingByEmail.supabaseId !== identity.providerUserId) {
      throw new Error("This verified email is already linked to another Supabase identity.");
    }

    return db.user.update({
      where: { id: existingByEmail.id },
      data: {
        supabaseId: identity.providerUserId,
        email: identity.email,
        firstName: identity.firstName ?? existingByEmail.firstName,
        lastName: identity.lastName ?? existingByEmail.lastName,
      },
    });
  }

  return db.user.create({
    data: identity.provider === "supabase"
      ? {
          clerkId: `supabase:${identity.providerUserId}`,
          supabaseId: identity.providerUserId,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
        }
      : {
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
