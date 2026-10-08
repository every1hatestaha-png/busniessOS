import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";

/**
 * Build the explicit, version-matched consent that the authenticated policy
 * endpoint requires. A checked signup checkbox is affirmative consent; an
 * unchecked box must not create or persist any acceptance.
 */
export function signupPolicyConsent(accepted: boolean) {
  if (!accepted) return null;
  return {
    terms: true as const,
    privacy: true as const,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  };
}
