import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("signup email OTP UI", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "sign-up", "[[...sign-up]]", "page.tsx"),
    "utf8",
  );

  it("renders a flexible numeric verification-code field after signup", () => {
    expect(source).toContain('id="verification-code"');
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain("maxLength={MAX_EMAIL_OTP_LENGTH}");
    expect(source).toContain("We sent a verification code");
  });

  it("verifies the emailed code with Supabase email OTP", () => {
    expect(source).toContain("supabase.auth.verifyOtp({");
    expect(source).toContain("email,");
    expect(source).toContain("token,");
    expect(source).toContain('type: "email"');
    expect(source).toContain("isValidEmailOtp");
    expect(source).toContain("normalizeEmailOtp");
    expect(source).toContain('window.location.assign("/onboarding")');
  });

  it("keeps resend recovery aligned with OTP wording", () => {
    expect(source).toContain("Resend verification code");
    expect(source).toContain("A new verification code has been requested.");
    expect(source).toContain("I already have a verification code");
    expect(source).toContain("Use another email");
  });
});
