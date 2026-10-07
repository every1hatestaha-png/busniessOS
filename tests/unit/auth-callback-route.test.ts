import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, getUser, getClaims, issueRecoveryMarker } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  issueRecoveryMarker: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession, getUser, getClaims },
  })),
}));
vi.mock("@/lib/server/recovery-session", () => ({ issueRecoveryMarker }));

import { GET } from "@/app/auth/callback/route";

describe("auth callback routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-04T00:00:00Z" } }, error: null });
    getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
  });

  it("does not exchange an incomplete link", async () => {
    const response = await GET(new Request("https://www.munshios.tech/auth/callback"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("Missing authentication code.");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does not claim email confirmation after an invalid or cross-device code exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code verifier") });
    const response = await GET(new Request("https://www.munshios.tech/auth/callback?code=invalid&next=/onboarding"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/onboarding");
    expect(location.searchParams.get("confirmation_error")).toBe("session");
    expect(location.searchParams.has("confirmed")).toBe(false);
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it("keeps successful signup exchange routing to onboarding", async () => {
    const response = await GET(new Request("https://www.munshios.tech/auth/callback?code=valid&next=/onboarding"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(response.headers.get("location")).toBe("https://www.munshios.tech/auth/post-login?next=%2Fonboarding");
  });

  it("sanitizes external redirect destinations on failed exchanges", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    const response = await GET(new Request("https://www.munshios.tech/auth/callback?code=invalid&next=https%3A%2F%2Fevil.example"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/auth/post-login");
  });

  it("preserves the cross-device recovery activation path", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("missing verifier") });
    const response = await GET(new Request("https://www.munshios.tech/auth/callback?code=invalid&next=%2Fforgot-password%3Fverified%3D1"));
    expect(response.headers.get("location")).toBe("https://www.munshios.tech/forgot-password?activation=1");
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it("issues the recovery marker only after confirmed fresh email proof", async () => {
    const response = await GET(new Request("https://www.munshios.tech/auth/callback?code=valid&next=%2Fforgot-password%3Fverified%3D1"));
    expect(response.headers.get("location")).toBe("https://www.munshios.tech/forgot-password?verified=1");
    expect(issueRecoveryMarker).toHaveBeenCalledOnce();
  });

  it("does not grant recovery proof to a password-authenticated session", async () => {
    getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await GET(new Request("https://www.munshios.tech/auth/callback?code=valid&next=%2Frecovery%2Fnew-password"));
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it("routes a fresh password recovery exchange to the password form on staging", async () => {
    getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    const response = await GET(new Request("https://staging.example.invalid/auth/callback?code=valid&next=%2Frecovery%2Fnew-password"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(issueRecoveryMarker).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("https://staging.example.invalid/recovery/new-password");
  });

  it("sends an expired or cross-browser recovery link back to request a fresh link", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("missing verifier") });
    const response = await GET(new Request("https://staging.example.invalid/auth/callback?code=invalid&next=%2Frecovery%2Fnew-password"));
    expect(response.headers.get("location")).toBe("https://staging.example.invalid/forgot-password?activation=1");
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it.each(["unconfirmed", "stale", "claims error"])("does not grant recovery proof for %s link sessions", async (state) => {
    if (state === "unconfirmed") getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    if (state === "stale") getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) - 601 }] } }, error: null });
    if (state === "claims error") getClaims.mockResolvedValue({ data: null, error: new Error("invalid claims") });
    await GET(new Request("https://staging.example.invalid/auth/callback?code=valid&next=%2Frecovery%2Fnew-password"));
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });
});
