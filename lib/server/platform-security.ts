import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function getVerifiedPlatformOwnerIdentity() {
  const configuredOwner = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) redirect("/dashboard");

  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) redirect("/platform/sign-in");

  const clerkUser = await (await clerkClient()).users.getUser(userId);
  const primaryEmail =
    clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  const email = primaryEmail?.emailAddress?.trim().toLowerCase();

  if (!email || primaryEmail?.verification?.status !== "verified" || email !== configuredOwner) {
    redirect("/dashboard");
  }

  return clerkUser;
}

export async function requirePlatformMfa() {
  const clerkUser = await getVerifiedPlatformOwnerIdentity();
  if (!clerkUser.twoFactorEnabled) redirect("/platform/security");
  return clerkUser;
}

export async function assertPlatformMfaEnabled() {
  const clerkUser = await getVerifiedPlatformOwnerIdentity();
  if (!clerkUser.twoFactorEnabled) {
    throw new Error("Platform MFA is required. Enable two-factor authentication in Platform Security before continuing.");
  }
  return clerkUser;
}
