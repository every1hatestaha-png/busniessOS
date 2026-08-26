import "server-only";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { db } from "@/lib/server/db";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    throw new Error("Your Clerk account needs an email address before using BusinessOS.");
  }

  return db.user.upsert({
    where: { clerkId: session.userId },
    create: {
      clerkId: session.userId,
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
});

export const getCurrentWorkspace = cache(async () => {
  const user = await getCurrentUser();
  const membership = await db.workspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });

  if (!membership) return null;

  return {
    user,
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
});

export async function requireWorkspace() {
  const context = await getCurrentWorkspace();
  if (!context) redirect("/onboarding");
  return context;
}
