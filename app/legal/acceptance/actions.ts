"use server";

import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/server/auth";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";
import { postAuthDestination } from "@/lib/auth-routing";
import { onboardingRouteFromReturnPath } from "@/lib/saas/provisioning-selection";

export async function acceptCurrentPolicies(formData: FormData) {
  const nextOnboarding = onboardingRouteFromReturnPath(typeof formData.get("next") === "string" ? String(formData.get("next")) : null);
  const acceptedTerms = formData.get("terms") === "on";
  const acknowledgedPrivacy = formData.get("privacy") === "on";
  if (!acceptedTerms || !acknowledgedPrivacy) {
    redirect(nextOnboarding ? `/legal/acceptance?error=required&next=${encodeURIComponent(nextOnboarding)}` : "/legal/acceptance?error=required");
  }

  const user = await getAuthenticatedUser();
  await recordCurrentPolicyAcceptance(user.id);
  redirect(postAuthDestination(nextOnboarding, "https://builder-return.invalid"));
}
