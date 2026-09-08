import { describe, expect, it } from "vitest";
import { getClerkUserIdentity, isClerkUserLifecycleEvent } from "@/lib/server/clerk-webhook";

describe("Clerk webhook parsing", () => {
  it("selects the primary snake-case email address", () => {
    expect(getClerkUserIdentity({ id: "user_1", primary_email_address_id: "idn_primary", email_addresses: [{ id: "idn_other", email_address: "other@example.com" }, { id: "idn_primary", email_address: "Primary@Example.com", verification: { status: "verified" } }], first_name: "Ada", last_name: "Lovelace" })).toEqual({ id: "user_1", email: "primary@example.com", verifiedPrimaryEmail: "primary@example.com", firstName: "Ada", lastName: "Lovelace" });
  });

  it("supports Clerk snapshot aliases and wrapped user data", () => {
    expect(getClerkUserIdentity({ user: { id: "user_2", primaryEmailAddressId: "idn_2", emailAddresses: [{ id: "idn_2", emailAddress: "mobile@example.com", verification: { status: "verified" } }], firstName: "Mobile" } })).toEqual({ id: "user_2", email: "mobile@example.com", verifiedPrimaryEmail: "mobile@example.com", firstName: "Mobile", lastName: null });
  });

  it("does not authorize invitations with a fallback or unverified primary email", () => {
    expect(getClerkUserIdentity({ id: "user_3", email_addresses: [{ id: "idn_3", email_address: "fallback@example.com", verification: { status: "verified" } }] })).toMatchObject({ email: "fallback@example.com", verifiedPrimaryEmail: null });
    expect(getClerkUserIdentity({ id: "user_4", primary_email_address_id: "idn_4", email_addresses: [{ id: "idn_4", email_address: "unverified@example.com", verification: { status: "unverified" } }] })).toMatchObject({ email: "unverified@example.com", verifiedPrimaryEmail: null });
  });

  it("supports a verified direct primary email object", () => {
    expect(getClerkUserIdentity({ id: "user_5", primary_email_address: { email_address: "Direct@Example.com", verification: { status: "verified" } } })).toMatchObject({ email: "direct@example.com", verifiedPrimaryEmail: "direct@example.com" });
  });

  it("recognizes only user lifecycle events", () => {
    expect(isClerkUserLifecycleEvent("user.created")).toBe(true);
    expect(isClerkUserLifecycleEvent("session.created")).toBe(false);
    expect(isClerkUserLifecycleEvent("email.created")).toBe(false);
  });
});
