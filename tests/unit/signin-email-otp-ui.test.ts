import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("sign-in verification code UI", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "sign-in", "[[...sign-in]]", "page.tsx"),
    "utf8",
  );

  it("provides a verification code field and verifies with Supabase", () => {
    expect(source).toContain('id="sign-in-verification-code"');
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain("supabase.auth.verifyOtp({");
    expect(source).toContain('type: "email"');
    expect(source).toContain("Resend verification code");
    expect(source).toContain("normalizeEmailOtp");
    expect(source).toContain("isValidEmailOtp");
  });
});
