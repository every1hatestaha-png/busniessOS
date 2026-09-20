import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import {
  isBuilderBusinessType,
  onboardingBusinessTypeForBuilder,
  sanitizeBilling,
  sanitizeProvisioningModules,
} from "@/lib/saas/provisioning-selection";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const context = await getCurrentWorkspace();
  const params = await searchParams;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const createAdditional = rawMode === "new";

  if (context && !createAdditional) redirect("/dashboard");
  const rawBusiness = Array.isArray(params.business) ? params.business[0] : params.business;
  const builderBusiness = isBuilderBusinessType(rawBusiness) ? rawBusiness : null;
  const modules = sanitizeProvisioningModules(params.modules);
  const billing = sanitizeBilling(Array.isArray(params.billing) ? params.billing[0] : params.billing);

  return (
    <OnboardingForm
      createAdditional={createAdditional}
      initialValues={{
        email: user.email,
        ownerName: [user.firstName, user.lastName].filter(Boolean).join(" "),
      }}
      provisioning={{
        builderBusiness,
        modules,
        billing,
        businessType: onboardingBusinessTypeForBuilder(builderBusiness),
      }}
    />
  );
}
