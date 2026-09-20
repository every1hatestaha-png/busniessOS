"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  isBuilderBusinessType,
  resolveProvisioningModules,
  sanitizeBilling,
  sanitizeProvisioningModules,
} from "@/lib/saas/provisioning-selection";
import { getCurrentUser } from "@/lib/server/auth";
import { createInitialWorkspace } from "@/lib/server/onboarding";
import { onboardingSchema } from "@/lib/validation/onboarding";

export type OnboardingState = { error: string | null };

export async function createWorkspace(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    businessName: formData.get("businessName"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    city: formData.get("city"),
    country: formData.get("country"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    businessType: formData.get("businessType"),
  });

  if (!parsed.success) {
    return { error: "Please check the business details and try again." };
  }

  const rawBuilderBusiness = String(formData.get("builderBusiness") ?? "").trim();
  const builderBusiness = isBuilderBusinessType(rawBuilderBusiness) ? rawBuilderBusiness : null;
  const modules = resolveProvisioningModules(
    sanitizeProvisioningModules(String(formData.get("selectedModules") ?? "")),
    builderBusiness,
  );
  const billing = sanitizeBilling(String(formData.get("billing") ?? "monthly"));
  const createAdditional = formData.get("creationMode") === "additional";

  const user = await getCurrentUser();
  try {
    const result = await createInitialWorkspace(user.id, parsed.data, {
      modules,
      billing,
      builderBusiness,
    }, {
      allowAdditional: createAdditional,
    });
    (await cookies()).set("businessos_workspace", result.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    return { error: "We could not create your workspace. Please try again." };
  }

  redirect("/dashboard");
}
