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
      type: "email",
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
      type: "email",
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
});
