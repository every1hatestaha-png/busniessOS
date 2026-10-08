import { describe, expect, it } from "vitest";

import { signupPolicyConsent } from "@/lib/legal/consent-request";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";

describe("signup to durable policy acceptance contract", () => {
  it("sends both affirmative acknowledgements at the current published policy versions", () => {
    const payload = signupPolicyConsent(true);
    expect(payload).toEqual({
      terms: true,
      privacy: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("does not produce acceptance for unchecked signup consent", () => {
    expect(signupPolicyConsent(false)).toBeNull();
  });

  it("never copies user IDs or acceptance timestamps from a browser into the consent payload", () => {
    const keys = Object.keys(signupPolicyConsent(true)!);
    expect(keys).toEqual(["terms", "privacy", "termsVersion", "privacyVersion"]);
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("termsAcceptedAt");
  });
});
