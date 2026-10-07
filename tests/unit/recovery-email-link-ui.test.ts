import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("link-only password recovery contract", () => {
  const source = readFileSync(join(process.cwd(), "app/forgot-password/page.tsx"), "utf8");

  it("offers an email link with generic account-existence copy", () => {
    expect(source).toContain("Check your email and open the password reset link.");
    expect(source).toContain("If an account exists for");
    expect(source).toContain("browser that requested it");
  });

  it("removes manual recovery-code entry and its alternate verification endpoint", () => {
    expect(source).not.toMatch(/one-time-code|verifyRecoveryCode|auth-email-otp|\/auth\/recovery\/verify/);
    expect(existsSync(join(process.cwd(), "app/auth/recovery/verify/route.ts"))).toBe(false);
  });
});
