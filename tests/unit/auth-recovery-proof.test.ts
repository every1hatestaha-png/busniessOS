import { describe, expect, it } from "vitest";

import { hasFreshRecoveryProof, RECOVERY_WINDOW_SECONDS } from "@/lib/auth-recovery-proof";

const NOW = 2_000_000_000;

describe("recovery proof freshness", () => {
  it.each(["otp", "recovery", "magiclink"])("accepts a fresh %s email-auth method", (method) => {
    expect(hasFreshRecoveryProof({ amr: [{ method, timestamp: NOW - 30 }] }, NOW)).toBe(true);
  });

  it("rejects a password-authenticated session", () => {
    expect(hasFreshRecoveryProof({ amr: [{ method: "password", timestamp: NOW }] }, NOW)).toBe(false);
  });

  it("rejects an expired email-auth proof", () => {
    expect(hasFreshRecoveryProof({ amr: [{ method: "otp", timestamp: NOW - RECOVERY_WINDOW_SECONDS - 1 }] }, NOW)).toBe(false);
  });

  it("rejects malformed AMR entries", () => {
    expect(hasFreshRecoveryProof({ amr: [{ method: "otp" }] }, NOW)).toBe(false);
    expect(hasFreshRecoveryProof({ amr: "otp" }, NOW)).toBe(false);
    expect(hasFreshRecoveryProof(null, NOW)).toBe(false);
  });
});
