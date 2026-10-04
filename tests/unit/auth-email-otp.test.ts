import { describe, expect, it } from "vitest";

import {
  MAX_EMAIL_OTP_LENGTH,
  MIN_EMAIL_OTP_LENGTH,
  isValidEmailOtp,
  normalizeEmailOtp,
} from "@/lib/auth-email-otp";

describe("email OTP rules", () => {
  it("normalizes pasted codes to digits only and bounds their length", () => {
    expect(normalizeEmailOtp("12 34-56ab78")).toBe("12345678");
    expect(normalizeEmailOtp("123456789012345")).toHaveLength(MAX_EMAIL_OTP_LENGTH);
  });

  it("accepts provider codes from the supported range", () => {
    expect(isValidEmailOtp("123456")).toBe(true);
    expect(isValidEmailOtp("12345678")).toBe(true);
    expect(isValidEmailOtp("1234567890")).toBe(true);
    expect(MIN_EMAIL_OTP_LENGTH).toBe(6);
    expect(MAX_EMAIL_OTP_LENGTH).toBe(10);
  });

  it("rejects short, long, or non-numeric codes", () => {
    expect(isValidEmailOtp("12345")).toBe(false);
    expect(isValidEmailOtp("12345678901")).toBe(false);
    expect(isValidEmailOtp("1234ab78")).toBe(false);
  });
});
