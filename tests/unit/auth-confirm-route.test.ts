import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, issueRecoveryMarker } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  issueRecoveryMarker: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

vi.mock("@/lib/server/recovery-session", () => ({
  issueRecoveryMarker,
}));

import { GET, POST } from "@/app/auth/confirm/route";

describe("auth confirmation route", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    issueRecoveryMarker.mockReset();
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example.invalid" },
    { origin: "http://localhost:8081" },
    { "sec-fetch-site": "cross-site" },
    { origin: "null" },
  ])("rejects cross-origin confirmation before consuming a token: %j", async headers => {
    const response = await POST(new Request("https://staging.example.invalid/auth/confirm", {
      method: "POST", headers,
      body: new URLSearchParams({ token_hash: "must-not-consume", type: "recovery" }),
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it("handles malformed confirmation bodies without verifying tokens", async () => {
    const response = await POST(new Request("https://staging.example.invalid/auth/confirm", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(response.headers.get("location")).toContain("confirmation_error=missing");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects incomplete confirmation links without calling Supabase", async () => {
    const response = await GET(new Request("https://www.munshios.tech/auth/confirm?type=signup"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.munshios.tech/sign-in?confirmation_error=missing",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies a token hash and redirects to onboarding", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(
      new Request("https://www.munshios.tech/auth/confirm?token_hash=abc&type=signup&next=/onboarding"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "signup" });
    expect(response.headers.get("location")).toBe("https://www.munshios.tech/auth/post-login?next=%2Fonboarding");
  });

  it("blocks external redirect destinations", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        "https://www.munshios.tech/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe("https://www.munshios.tech/auth/post-login");
  });

  it("sends invalid or expired signup tokens to a recoverable sign-in state", async () => {
    verifyOtp.mockResolvedValue({ error: new Error("expired") });
    const response = await GET(
      new Request("https://www.munshios.tech/auth/confirm?token_hash=abc&type=signup"),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.munshios.tech/sign-in?confirmation_error=expired",
    );
  });

  it("does not consume recovery tokens on GET", async () => {
    const response = await GET(
      new Request(
        "https://www.munshios.tech/auth/confirm?token_hash=recovery-token&type=recovery&next=/recovery/new-password",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Continue securely");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("consumes a recovery token only after POST and issues the recovery marker", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-10-07T00:00:00Z" } },
      error: null,
    });

    const response = await POST(
      new Request("https://www.munshios.tech/auth/confirm", {
        method: "POST",
        body: new URLSearchParams({
          token_hash: "recovery-token",
          type: "recovery",
          next: "/recovery/new-password",
        }),
      }),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-token",
      type: "recovery",
    });
    expect(issueRecoveryMarker).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.munshios.tech/recovery/new-password",
    );
  });

  it("rejects a consumed recovery token on a second confirmation", async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { email_confirmed_at: "2026-10-07" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("expired") });
    const request = () => new Request("https://staging.example.invalid/auth/confirm", {
      method: "POST", body: new URLSearchParams({ token_hash: "single-use", type: "recovery", next: "/recovery/new-password" }),
    });
    expect((await POST(request())).headers.get("location")).toContain("/recovery/new-password");
    expect((await POST(request())).headers.get("location")).toContain("confirmation_error=expired");
    expect(issueRecoveryMarker).toHaveBeenCalledOnce();
  });

  it("rejects expired recovery tokens without issuing a marker", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new Error("expired"),
    });

    const response = await POST(
      new Request("https://www.munshios.tech/auth/confirm", {
        method: "POST",
        body: new URLSearchParams({
          token_hash: "expired-token",
          type: "recovery",
          next: "/recovery/new-password",
        }),
      }),
    );

    expect(issueRecoveryMarker).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain(
      "/forgot-password?activation=1&confirmation_error=expired",
    );
  });
});
