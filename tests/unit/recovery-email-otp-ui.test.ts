import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("recovery email OTP UI", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "forgot-password", "page.tsx"),
    "utf8",
  );

  it("uses the same bounded numeric OTP rules as signup and sign-in", () => {
    expect(source).toContain("normalizeEmailOtp");
    expect(source).toContain("isValidEmailOtp");
    expect(source).toContain("maxLength={MAX_EMAIL_OTP_LENGTH}");
    expect(source).toContain('autoComplete="one-time-code"');
  });

  it("does not hardcode six or eight digits in customer-facing copy", () => {
    expect(source).not.toContain("6–8 digit");
    expect(source).not.toContain("6-digit");
    expect(source).not.toContain("8-digit");
  });
});
