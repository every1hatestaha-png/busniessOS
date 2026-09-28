import { describe, expect, it } from "vitest";

import {
  MAX_NEW_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  isAcceptableNewPassword,
} from "@/lib/auth-password-policy";

describe("auth password policy", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(isAcceptableNewPassword("a".repeat(MIN_NEW_PASSWORD_LENGTH - 1))).toBe(false);
  });

  it("accepts passwords at the minimum and maximum lengths", () => {
    expect(isAcceptableNewPassword("a".repeat(MIN_NEW_PASSWORD_LENGTH))).toBe(true);
    expect(isAcceptableNewPassword("a".repeat(MAX_NEW_PASSWORD_LENGTH))).toBe(true);
  });

  it("rejects passwords longer than the maximum", () => {
    expect(isAcceptableNewPassword("a".repeat(MAX_NEW_PASSWORD_LENGTH + 1))).toBe(false);
  });
});
