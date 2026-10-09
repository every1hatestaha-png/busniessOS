import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
import { onboardingRouteFromReturnPath } from "@/lib/saas/provisioning-selection";

const mocks = vi.hoisted(() => ({ user: vi.fn(), record: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/server/auth", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("@/lib/server/legal", () => ({ recordCurrentPolicyAcceptance: mocks.record }));
import PolicyAcceptancePage from "@/app/legal/acceptance/page";
import { acceptCurrentPolicies } from "@/app/legal/acceptance/actions";

const raw = "/onboarding?business=restaurant&modules=restaurant,unknown&billing=annual&role=OWNER&workspaceId=foreign";
const next = "/onboarding?business=restaurant&modules=inventory%2Crestaurant&billing=annual";
const canonical = `/auth/post-login?next=${encodeURIComponent(next)}`;
const form = (destination: string, accepted = true) => {
  const data = new FormData();
  data.set("next", destination);
  data.set("userId", "foreign");
  if (accepted) { data.set("terms", "on"); data.set("privacy", "on"); }
  return data;
};

describe("policy gate and builder onboarding convergence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "authenticated-local-user" });
    mocks.record.mockResolvedValue({});
  });
  it("renders only sanitized preferences in the authenticated consent form", async () => {
    const page = await PolicyAcceptancePage({ searchParams: Promise.resolve({ next: raw }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(`name="next" value="${next.replaceAll("&", "&amp;")}"`);
    expect(html).not.toContain("foreign");
    expect(html).toContain('name="terms"');
    expect(html).toContain('name="privacy"');
    expect(mocks.user).toHaveBeenCalledOnce();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("records consent for the authenticated user before canonical onboarding routing", async () => {
    await expect(acceptCurrentPolicies(form(raw))).rejects.toThrow(`redirect:${canonical}`);
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith("authenticated-local-user");
  });
  it("keeps sanitized preferences after missing acknowledgements without writes", async () => {
    await expect(acceptCurrentPolicies(form(raw, false))).rejects.toThrow(`redirect:/legal/acceptance?error=required&next=${encodeURIComponent(next)}`);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("does not navigate past failed authentication or a failed consent write", async () => {
    mocks.user.mockRejectedValueOnce(new Error("redirect:/sign-in"));
    await expect(acceptCurrentPolicies(form(raw))).rejects.toThrow("redirect:/sign-in");
    expect(mocks.record).not.toHaveBeenCalled();
    mocks.record.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(acceptCurrentPolicies(form(raw))).rejects.toThrow("database unavailable");
  });
  it("preserves preferences for an already accepted session without recording consent again", async () => {
    mocks.user.mockResolvedValue({ id: "authenticated-local-user", termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION, privacyAcknowledgedAt: new Date(), privacyVersion: CURRENT_PRIVACY_VERSION });
    await expect(PolicyAcceptancePage({ searchParams: Promise.resolve({ next: raw }) })).rejects.toThrow(`redirect:${canonical}`);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example/onboarding?business=restaurant", "//evil.example/onboarding?business=restaurant", "javascript:alert(1)", "/restaurant?workspaceId=foreign", "/onboarding/../restaurant?business=restaurant", "/onboarding?business=unknown", "/onboarding\\evil?business=restaurant", "/%6fnboarding?business=restaurant"])("rejects forged policy return %s", async destination => {
    expect(onboardingRouteFromReturnPath(destination)).toBeNull();
    await expect(acceptCurrentPolicies(form(destination))).rejects.toThrow("redirect:/auth/post-login");
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith("authenticated-local-user");
  });
});
