import { describe, expect, it } from "vitest";
import {
  MIN_INITIAL_PAYMENT_PKR,
  PaymentRequiredError,
  PROTECTED_LEGACY_WORKSPACE_IDS,
  isProtectedLegacyWorkspace,
} from "@/lib/saas/payment-first";

describe("paid-only workspace rules", () => {
  it("requires the listed setup fee plus the first monthly subscription", () => {
    expect(MIN_INITIAL_PAYMENT_PKR).toBe(34_000);
  });
  it("protects precisely the three owner-approved legacy workspaces", () => {
    expect(PROTECTED_LEGACY_WORKSPACE_IDS.size).toBe(3);
    expect(isProtectedLegacyWorkspace("c15e0dd4-9d61-407b-a4dc-5490e2247151")).toBe(true);
    expect(isProtectedLegacyWorkspace("4bc313cf-2869-4d87-8f1e-22a147f18d2d")).toBe(true);
    expect(isProtectedLegacyWorkspace("a9e7ed7d-d3c2-434a-992e-972fb088273a")).toBe(true);
    expect(isProtectedLegacyWorkspace("another-workspace")).toBe(false);
  });
  it("never determines exemptions by customer email", () => {
    expect(isProtectedLegacyWorkspace("every1hatestaha@gmail.com")).toBe(false);
  });
  it("has a typed fail-closed payment error", () => {
    expect(new PaymentRequiredError().message).toMatch(/Payment verification/);
  });
});
