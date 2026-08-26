import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  const context = await getCurrentWorkspace();

  if (context) redirect("/dashboard");

  return (
    <OnboardingForm
      initialValues={{
        email: user.email,
        ownerName: [user.firstName, user.lastName].filter(Boolean).join(" "),
      }}
    />
  );
}
