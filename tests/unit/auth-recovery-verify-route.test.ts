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
vi.mock("@/lib/server/recovery-session", () => ({ issueRecoveryMarker }));

import { POST } from "@/app/auth/recovery/verify/route";

describe("recovery verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyOtp.mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-10-04T00:00:00Z" } },
      error: null,
    });
  });

  it("accepts an eight-digit production-style verification code", async () => {
    const response = await POST(new Request("https://www.munshios.tech/auth/recovery/verify", {
      method: "POST",
      body: JSON.stringify({ email: "USER@example.com", token: "12345678" }),
    }));

    expect(response.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "12345678",
      type: "recovery",
    });
    expect(issueRecoveryMarker).toHaveBeenCalledOnce();
  });

  it("normalizes separators before verifying", async () => {
    const response = await POST(new Request("https://www.munshios.tech/auth/recovery/verify", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", token: "12 34-56 78" }),
    }));

    expect(response.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "12345678",
      type: "recovery",
    });
  });

  it("rejects out-of-range codes before calling Supabase", async () => {
    const response = await POST(new Request("https://www.munshios.tech/auth/recovery/verify", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", token: "12345" }),
    }));

    expect(response.status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });

  it("does not issue password recovery proof for a rejected sign-in code", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired" } });
    const response = await POST(new Request("https://staging.example.invalid/auth/recovery/verify", {
      method: "POST", body: JSON.stringify({ email: "user@example.invalid", token: "12345678" }),
    }));
    expect(response.status).toBe(400);
    expect(verifyOtp).toHaveBeenCalledWith({ email: "user@example.invalid", token: "12345678", type: "recovery" });
    expect(issueRecoveryMarker).not.toHaveBeenCalled();
  });
});
