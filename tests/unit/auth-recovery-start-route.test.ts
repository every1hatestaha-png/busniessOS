import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOtp, findLegacyUser } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  findLegacyUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { signInWithOtp } })),
}));
vi.mock("@/lib/server/db", () => ({ db: { user: { findFirst: findLegacyUser } } }));

import { POST } from "@/app/auth/recovery/start/route";

const origin = "https://munshios-restaurant-staging-p438m6ju3-khzr.vercel.app";
const missingIdentity = { error: { code: "otp_disabled", status: 422 } };
const request = (body: unknown) => new Request(`${origin}/auth/recovery/start`, {
  method: "POST", body: JSON.stringify(body),
});

describe("recovery start across canonical and legacy identities", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signInWithOtp.mockResolvedValue({ error: null });
    findLegacyUser.mockResolvedValue(null);
  });

  it("recovers a canonical Supabase user without requiring a local user row", async () => {
    const response = await POST(request({ email: " CANONICAL@example.invalid " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: "canonical@example.invalid",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${origin}/auth/callback?next=%2Fforgot-password%3Fverified%3D1`,
      },
    });
    expect(findLegacyUser).not.toHaveBeenCalled();
  });

  it("preserves activation for an existing unlinked legacy MunshiOS user", async () => {
    signInWithOtp.mockResolvedValueOnce(missingIdentity).mockResolvedValueOnce({ error: null });
    findLegacyUser.mockResolvedValue({ id: "existing-legacy-user" });
    const response = await POST(request({ email: "LEGACY@example.invalid" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledTimes(2);
    expect(signInWithOtp).toHaveBeenLastCalledWith({
      email: "legacy@example.invalid",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback?next=%2Fforgot-password%3Fverified%3D1`,
      },
    });
    expect(findLegacyUser).toHaveBeenCalledWith({
      where: { email: { equals: "legacy@example.invalid", mode: "insensitive" }, supabaseId: null },
      select: { id: true },
    });
  });

  it("does not create identities for unknown emails or reveal provider rejection", async () => {
    signInWithOtp.mockResolvedValue(missingIdentity);
    const response = await POST(request({ email: "unknown@example.invalid" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });

  it("does not use legacy activation to retry a provider rate limit", async () => {
    signInWithOtp.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    findLegacyUser.mockResolvedValue({ id: "existing-legacy-user" });
    const response = await POST(request({ email: "legacy@example.invalid" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(findLegacyUser).not.toHaveBeenCalled();
  });

  it("keeps preview redirects on the requesting deployment and rejects external destinations", async () => {
    await POST(request({ email: "canonical@example.invalid", redirectTo: "http://localhost:3000/recovery/new-password" }));
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      `${origin}/auth/callback?next=%2Fforgot-password%3Fverified%3D1`,
    );
    await POST(request({ email: "canonical@example.invalid", redirectTo: "/auth/callback?next=%2Frecovery%2Fnew-password" }));
    expect(signInWithOtp.mock.calls[1][0].options.emailRedirectTo).toBe(
      `${origin}/auth/callback?next=%2Frecovery%2Fnew-password`,
    );
  });

  it("fails closed if legacy eligibility cannot be checked", async () => {
    signInWithOtp.mockResolvedValue(missingIdentity);
    findLegacyUser.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request({ email: "legacy@example.invalid" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledOnce();
  });

  it("rejects malformed input without sending email or querying identities", async () => {
    const response = await POST(request({ email: "not-an-email" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(findLegacyUser).not.toHaveBeenCalled();
  });
});
