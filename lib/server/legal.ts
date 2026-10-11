import "server-only";

import { db } from "@/lib/server/db";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  hasCurrentPolicyAcceptance,
} from "@/lib/legal/policies";

export async function recordCurrentPolicyAcceptance(userId: string) {
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: {
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcknowledgedAt: true,
      privacyVersion: true,
    },
  });
  if (!existing) throw new Error("User not found.");

  if (hasCurrentPolicyAcceptance(existing)) return existing;

  const acceptedAt = new Date();
  return db.user.update({
    where: { id: userId },
    data: {
      termsAcceptedAt: acceptedAt,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyAcknowledgedAt: acceptedAt,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
    select: {
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcknowledgedAt: true,
      privacyVersion: true,
    },
  });
}
