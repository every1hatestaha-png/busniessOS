import { describe, expect, it } from "vitest";

import { getSignInFeedback } from "@/lib/auth-sign-in-feedback";

describe("MunshiOS sign-in errors do not imply a forced legacy reset", () => {
  it.each([
    { code: "invalid_credentials", message: "Invalid login credentials" },
    { message: "Invalid login credentials" },
    { code: "invalid_credentials", message: "Invalid username or password" },
  ])("uses a generic invalid-credentials message without a migration claim", (failure) => {
    expect(getSignInFeedback(failure)).toEqual({
      message: "Email or password is incorrect.",
      requiresEmailVerification: false,
    });
  });

  it("offers the verification flow for unconfirmed emails, not a password reset", () => {
    expect(getSignInFeedback({ code: "email_not_confirmed", message: "Email not confirmed", status: 400 }))
      .toEqual({ message: "Your email has not been verified yet.", requiresEmailVerification: true });
  });

  it("distinguishes rate limiting and does not suggest changing the password", () => {
    expect(getSignInFeedback({ message: "Rate limit exceeded", status: 429 }))
      .toEqual({ message: "Too many sign-in attempts. Please wait a moment and try again.", requiresEmailVerification: false });
    expect(getSignInFeedback({ code: "over_request_rate_limit", message: "Oops" }).message)
      .toMatch(/too many sign-in attempts/i);
  });

  it("does not leak provider/server errors to the user", () => {
    const feedback = getSignInFeedback({ message: "internal-db-jwt-key-contents", code: "server_error", status: 500 });
    expect(feedback.message).toBe("We could not sign you in right now. Please try again.");
    expect(feedback.message).not.toContain("internal-db");
    expect(feedback.requiresEmailVerification).toBe(false);
  });
});
