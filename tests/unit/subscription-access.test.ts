import { describe, expect, it } from "vitest";

import {
  computeWorkspaceAccess,
  type SubscriptionSnapshot,
} from "@/lib/subscriptions/access";

const now = new Date("2026-09-12T12:00:00.000Z");

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id: "sub_test",
    workspaceId: "workspace_test",
    planId: "plan_starter",
    planCode: "starter",
    planName: "Starter",
    status: "TRIALING",
    trialStartedAt: new Date("2026-09-01T12:00:00.000Z"),
    trialEndsAt: new Date("2026-10-01T12:00:00.000Z"),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    overrideUntil: null,
    suspendedAt: null,
    suspensionReason: null,
    ...overrides,
  };
}

describe("subscription access policy", () => {
  it("allows a live trial and reports remaining days", () => {
    const access = computeWorkspaceAccess(snapshot(), now);
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("trial");
    expect(access.daysRemaining).toBe(19);
  });

  it("expires a trial exactly at the authoritative end timestamp", () => {
    const access = computeWorkspaceAccess(snapshot({ trialEndsAt: now }), now);
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("expired");
    expect(access.daysRemaining).toBe(0);
  });

  it("allows an active paid subscription", () => {
    const access = computeWorkspaceAccess(
      snapshot({
        status: "ACTIVE",
        trialEndsAt: null,
        currentPeriodStart: new Date("2026-09-01T12:00:00.000Z"),
        currentPeriodEnd: new Date("2026-10-01T12:00:00.000Z"),
      }),
      now,
    );
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("active");
  });

  it("uses grace access after a paid period ends", () => {
    const access = computeWorkspaceAccess(
      snapshot({
        status: "PAST_DUE",
        trialEndsAt: null,
        currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
        graceEndsAt: new Date("2026-09-16T12:00:00.000Z"),
      }),
      now,
    );
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("grace");
    expect(access.daysRemaining).toBe(4);
  });

  it("allows a valid platform override", () => {
    const access = computeWorkspaceAccess(
      snapshot({
        status: "EXPIRED",
        trialEndsAt: new Date("2026-09-01T12:00:00.000Z"),
        overrideUntil: new Date("2026-09-14T12:00:00.000Z"),
      }),
      now,
    );
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("override");
  });

  it("makes a manual suspension authoritative even when an override exists", () => {
    const access = computeWorkspaceAccess(
      snapshot({
        status: "SUSPENDED",
        overrideUntil: new Date("2026-09-20T12:00:00.000Z"),
        suspendedAt: new Date("2026-09-12T11:00:00.000Z"),
      }),
      now,
    );
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("suspended");
  });
});
