import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetPasswordForEmail, signInWithOtp, signUp, createUser, findLegacyUser } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), signInWithOtp: vi.fn(), signUp: vi.fn(), createUser: vi.fn(), findLegacyUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { resetPasswordForEmail, signInWithOtp, signUp, admin: { createUser } } })),
}));
vi.mock("@/lib/server/db", () => ({ db: { user: { findFirst: findLegacyUser } } }));

import { POST } from "@/app/auth/recovery/start/route";

const origin = "https://staging.example.invalid";
const callback = `${origin}/auth/callback?next=%2Frecovery%2Fnew-password`;
const request = (body: unknown) => new Request(`${origin}/auth/recovery/start`, { method: "POST", body: JSON.stringify(body) });
async function expectGeneric(response: Response) {
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}
function expectNoProvisioning() {
  expect(signInWithOtp).not.toHaveBeenCalled();
  expect(signUp).not.toHaveBeenCalled();
  expect(createUser).not.toHaveBeenCalled();
  expect(findLegacyUser).not.toHaveBeenCalled();
}

describe("password recovery start", () => {
  const originalRedirectOrigin = process.env.AUTH_REDIRECT_ORIGIN;

  beforeEach(() => {
    delete process.env.AUTH_REDIRECT_ORIGIN;
    vi.resetAllMocks();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (originalRedirectOrigin === undefined) delete process.env.AUTH_REDIRECT_ORIGIN;
    else process.env.AUTH_REDIRECT_ORIGIN = originalRedirectOrigin;
  });

  it("requests password recovery for a canonical user without a local user row", async () => {
    await expectGeneric(await POST(request({ email: " CANONICAL@example.invalid " })));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("canonical@example.invalid", { redirectTo: callback });
    expectNoProvisioning();
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example.invalid" },
    { origin: "http://localhost:8081" },
    { "sec-fetch-site": "cross-site" },
    { origin: "null" },
  ])("rejects cross-origin reset requests without sending email: %j", async headers => {
    const response = await POST(new Request(`${origin}/auth/recovery/start`, {
      method: "POST", headers, body: JSON.stringify({ email: "canonical@example.invalid" }),
    }));
    expect(response.status).toBe(403);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expectNoProvisioning();
  });

  it("accepts a same-origin recovery request", async () => {
    await expectGeneric(await POST(new Request(`${origin}/auth/recovery/start`, {
      method: "POST", headers: { origin }, body: JSON.stringify({ email: "canonical@example.invalid" }),
    })));
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
  });

  it("preserves normalized legacy email recovery without creating or remapping users", async () => {
    findLegacyUser.mockResolvedValue({ id: "legacy-user", supabaseId: null });
    await expectGeneric(await POST(request({ email: " LEGACY@example.invalid " })));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("legacy@example.invalid", { redirectTo: callback });
    expectNoProvisioning();
  });

  it("keeps an unknown identity rejection indistinguishable from a successful request", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found", status: 404 } });
    await expectGeneric(await POST(request({ email: "unknown@example.invalid" })));
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
    expectNoProvisioning();
  });

  it.each(["otp_disabled", "over_email_send_rate_limit"])("does not fall back to sign-in or creation after %s", async (code) => {
    resetPasswordForEmail.mockResolvedValue({ error: { code, status: 422 } });
    await expectGeneric(await POST(request({ email: "legacy@example.invalid" })));
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
    expectNoProvisioning();
  });

  it.each(["http://localhost:3000/recovery/new-password", "https://evil.example.invalid/reset", "//evil.example.invalid/reset", "/sign-in"])("rejects unsafe redirect %s", async (redirectTo) => {
    await POST(request({ email: "canonical@example.invalid", redirectTo }));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("canonical@example.invalid", { redirectTo: callback });
  });

  it("rejects an insecure configured recovery origin", async () => {
    process.env.AUTH_REDIRECT_ORIGIN = "http://evil.example.invalid";
    await POST(request({ email: "canonical@example.invalid" }));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("canonical@example.invalid", { redirectTo: callback });
  });

  it("allows local HTTP only for non-production development recovery", async () => {
    process.env.AUTH_REDIRECT_ORIGIN = "http://localhost:3000";
    await POST(request({ email: "canonical@example.invalid" }));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("canonical@example.invalid", {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Frecovery%2Fnew-password",
    });
  });

  it("preserves a safe same-origin legacy callback destination", async () => {
    const redirectTo = "/auth/callback?next=%2Fforgot-password%3Fverified%3D1";
    await POST(request({ email: "canonical@example.invalid", redirectTo }));
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("canonical@example.invalid", { redirectTo: origin + redirectTo });
  });

  it("keeps provider transport failure generic without provisioning", async () => {
    resetPasswordForEmail.mockRejectedValue(new Error("unavailable"));
    await expectGeneric(await POST(request({ email: "legacy@example.invalid" })));
    expectNoProvisioning();
  });

  it("does not call the provider for malformed input", async () => {
    await expectGeneric(await POST(request({ email: "not-an-email" })));
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expectNoProvisioning();
  });
});
