"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/auth";
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

  const user = await getCurrentUser();
  const nameParts = parsed.data.ownerName.split(/\s+/);
  const firstName = nameParts.shift() ?? parsed.data.ownerName;
  const lastName = nameParts.join(" ") || null;

  try {
    await db.$transaction(async (tx) => {
      const membership = await tx.workspaceMember.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });

      if (membership) return;

      const workspace = await tx.workspace.create({
        data: {
          name: parsed.data.businessName,
          phone: parsed.data.phone,
          email: parsed.data.email,
          address: parsed.data.address,
          city: parsed.data.city,
          country: parsed.data.country,
          currency: parsed.data.currency.toUpperCase(),
          timezone: parsed.data.timezone,
          businessType: parsed.data.businessType,
        },
        select: { id: true },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { firstName, lastName },
      });
    }, { isolationLevel: "Serializable" });
  } catch {
    const existingMembership = await db.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!existingMembership) {
      return { error: "We could not create your workspace. Please try again." };
    }
  }

  redirect("/dashboard");
}
