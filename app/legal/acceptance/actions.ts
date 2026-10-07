"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server/auth";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";

export async function acceptCurrentPolicies(formData: FormData) {
  const acceptedTerms = formData.get("terms") === "on";
  const acknowledgedPrivacy = formData.get("privacy") === "on";
  if (!acceptedTerms || !acknowledgedPrivacy) {
    redirect("/legal/acceptance?error=required");
  }

  const user = await getCurrentUser();
  await recordCurrentPolicyAcceptance(user.id);
  redirect("/auth/post-login");
}
