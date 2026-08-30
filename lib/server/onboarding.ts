import "server-only";

import { db } from "@/lib/server/db";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";

export async function createInitialWorkspace(userId: string, input: OnboardingInput) {
  const data = onboardingSchema.parse(input);
  const nameParts = data.ownerName.split(/\s+/);
  const firstName = nameParts.shift() ?? data.ownerName;
  const lastName = nameParts.join(" ") || null;

  try {
    return await withSerializableRetry(async (tx) => {
      const existing = await tx.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
      if (existing) return existing;
      const workspace = await tx.workspace.create({ data: { name: data.businessName, phone: data.phone, email: data.email, address: data.address, city: data.city, country: data.country, currency: data.currency.toUpperCase(), timezone: data.timezone, businessType: data.businessType }, select: { id: true } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });
      await tx.user.update({ where: { id: userId }, data: { firstName, lastName } });
      return { workspaceId: workspace.id };
    });
  } catch (error) {
    const existing = await db.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
    if (existing) return existing;
    throw error;
  }
}
