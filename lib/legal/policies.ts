export const CURRENT_TERMS_VERSION = "2026-10-07";
export const CURRENT_PRIVACY_VERSION = "2026-10-07";

export type PolicyAcceptanceLike = {
  termsAcceptedAt?: Date | string | null;
  termsVersion?: string | null;
  privacyAcknowledgedAt?: Date | string | null;
  privacyVersion?: string | null;
};

export function hasCurrentPolicyAcceptance(user: PolicyAcceptanceLike) {
  return Boolean(
    user.termsAcceptedAt
    && user.privacyAcknowledgedAt
    && user.termsVersion === CURRENT_TERMS_VERSION
    && user.privacyVersion === CURRENT_PRIVACY_VERSION,
  );
}
