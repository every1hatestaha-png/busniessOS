import { describe, expect, it } from "vitest";
import { getClerkUserIdentity, isClerkUserLifecycleEvent } from "@/lib/server/clerk-webhook";

describe("Clerk webhook parsing", () => {
  it("selects the primary snake-case email address", () => {
    expect(getClerkUserIdentity({ id: "user_1", primary_email_address_id: "idn_primary", email_addresses: [{ id: "idn_other", email_address: "other@example.com" }, { id: "idn_primary", email_address: "Primary@Example.com" }], first_name: "Ada", last_name: "Lovelace" })).toEqual({ id: "user_1", email: "primary@example.com", firstName: "Ada", lastName: "Lovelace" });
  });

  it("supports Clerk snapshot aliases and wrapped user data", () => {
    expect(getClerkUserIdentity({ user: { id: "user_2", primaryEmailAddressId: "idn_2", emailAddresses: [{ id: "idn_2", emailAddress: "mobile@example.com" }], firstName: "Mobile" } })).toEqual({ id: "user_2", email: "mobile@example.com", firstName: "Mobile", lastName: null });
  });

  it("falls back to the first available email", () => {
    expect(getClerkUserIdentity({ id: "user_3", email_addresses: [{ id: "idn_3", email_address: "fallback@example.com" }] })?.email).toBe("fallback@example.com");
  });

  it("recognizes only user lifecycle events", () => {
    expect(isClerkUserLifecycleEvent("user.created")).toBe(true);
    expect(isClerkUserLifecycleEvent("session.created")).toBe(false);
    expect(isClerkUserLifecycleEvent("email.created")).toBe(false);
  });
});
