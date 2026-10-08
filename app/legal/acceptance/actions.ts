"use server";

import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/server/auth";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";

export async function acceptCurrentPolicies(formData: FormData) {
  const acceptedTerms = formData.get("terms") === "on";
  const acknowledgedPrivacy = formData.get("privacy") === "on";
  if (!acceptedTerms || !acknowledgedPrivacy) {
    redirect("/legal/acceptance?error=required");
  }

  const user = await getAuthenticatedUser();
  await recordCurrentPolicyAcceptance(user.id);
  redirect("/auth/post-login");
}
