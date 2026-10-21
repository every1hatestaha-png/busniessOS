import "server-only";

import { redirect } from "next/navigation";

import { isPlatformOwner, hasRecentPlatformMfa } from "@/lib/platform-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Uses a live Supabase getUser lookup. Never use a local workspace role, email
 * in a client cookie, or user_metadata to authorize platform administration.
 */
export async function getVerifiedPlatformOwnerIdentity() {
  const ownerEmail = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL;
  if (!ownerEmail?.trim() || !process.env.MUNSHIOS_PLATFORM_OWNER_SUPABASE_ID?.trim()) redirect("/platform/access-denied");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/admin");

  if (!isPlatformOwner(data.user, ownerEmail, process.env.MUNSHIOS_PLATFORM_OWNER_SUPABASE_ID)) {
    redirect("/platform/access-denied");
  }

  return data.user;
}

async function getPlatformAssurance() {
  // Identity is checked from Supabase Auth on every privileged server request.
  await getVerifiedPlatformOwnerIdentity();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return data;
}

export async function requirePlatformMfa() {
  const owner = await getVerifiedPlatformOwnerIdentity();
  const assurance = await getPlatformAssurance();
  if (!hasRecentPlatformMfa(assurance)) {
    redirect("/admin/security");
  }
  return owner;
}

/** Must be called on the server before EVERY platform mutation, not only by the UI. */
export async function assertPlatformMfaEnabled() {
  const assurance = await getPlatformAssurance();
  if (!hasRecentPlatformMfa(assurance)) {
    throw new Error("Recent owner MFA verification required. Open /platform/security and verify your authenticator code.");
  }
}
