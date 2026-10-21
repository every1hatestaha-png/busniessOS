import { describe, expect, it } from "vitest";
import { hasRecentPlatformMfa, isPlatformOwner, PLATFORM_MFA_MAX_AGE_MS } from "@/lib/platform-access";

const owner = {
  id: "supabase-owner",
  email: "OWNER@example.test",
  email_confirmed_at: "2026-10-21T00:00:00.000Z",
};
const now = Date.UTC(2026, 9, 21, 14, 0, 0);
const verified = (time: number) => ({
  currentLevel: "aal2",
  nextLevel: "aal2",
  currentAuthenticationMethods: [
    { method: "password", timestamp: (now - 60_000) / 1000 },
    { method: "totp", timestamp: time / 1000 },
  ],
});

describe("platform owner authorization", () => {
  it("accepts only a confirmed owner with the configured address", () => {
    expect(isPlatformOwner(owner, "owner@example.test")).toBe(true);
    expect(isPlatformOwner(owner, " Owner@Example.Test ")).toBe(true);
    expect(isPlatformOwner(owner, undefined)).toBe(false);
    expect(isPlatformOwner(null, "owner@example.test")).toBe(false);
    expect(isPlatformOwner({ ...owner, email_confirmed_at: null }, "owner@example.test")).toBe(false);
    expect(isPlatformOwner({ ...owner, is_anonymous: true }, "owner@example.test")).toBe(false);
    expect(isPlatformOwner({ ...owner, email: "attacker@example.test" }, "owner@example.test")).toBe(false);
  });
  it("enforces optional immutable Supabase user id pinning", () => {
    expect(isPlatformOwner(owner, "owner@example.test", "supabase-owner")).toBe(true);
    expect(isPlatformOwner(owner, "owner@example.test", "different-id")).toBe(false);
  });
});

describe("platform privileged mutation MFA", () => {
  it("requires a recent second factor in an AAL2 session", () => {
    expect(hasRecentPlatformMfa(verified(now - 1_000), now)).toBe(true);
    expect(hasRecentPlatformMfa(verified(now - PLATFORM_MFA_MAX_AGE_MS), now)).toBe(true);
    expect(hasRecentPlatformMfa(verified(now - PLATFORM_MFA_MAX_AGE_MS - 1), now)).toBe(false);
    expect(hasRecentPlatformMfa(verified(now + 1_000), now)).toBe(false);
  });
  it("fails closed on missing or stale assurance and methods", () => {
    expect(hasRecentPlatformMfa(null, now)).toBe(false);
    expect(hasRecentPlatformMfa({ ...verified(now), currentLevel: "aal1" }, now)).toBe(false);
    expect(hasRecentPlatformMfa({ ...verified(now), nextLevel: "aal1" }, now)).toBe(false);
    expect(hasRecentPlatformMfa({ currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] }, now)).toBe(false);
    expect(hasRecentPlatformMfa({ currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "password", timestamp: now / 1000 }] }, now)).toBe(false);
  });
});
