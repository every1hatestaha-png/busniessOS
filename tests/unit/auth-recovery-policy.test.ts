import { describe, expect, it } from "vitest";

function shouldRelinkExistingUser(input: {
  existingClerkMatch: boolean;
  verifiedEmail: boolean;
  existingEmailMatch: boolean;
}) {
  if (input.existingClerkMatch) return false;
  return input.verifiedEmail && input.existingEmailMatch;
}

describe("auth recovery identity policy", () => {
  it("relinks a new Clerk identity only when the existing MunshiOS email is verified", () => {
    expect(shouldRelinkExistingUser({
      existingClerkMatch: false,
      verifiedEmail: true,
      existingEmailMatch: true,
    })).toBe(true);
  });

  it("does not relink an unverified email identity", () => {
    expect(shouldRelinkExistingUser({
      existingClerkMatch: false,
      verifiedEmail: false,
      existingEmailMatch: true,
    })).toBe(false);
  });

  it("does not relink when the authenticated Clerk identity already matches", () => {
    expect(shouldRelinkExistingUser({
      existingClerkMatch: true,
      verifiedEmail: true,
      existingEmailMatch: true,
    })).toBe(false);
  });
});
