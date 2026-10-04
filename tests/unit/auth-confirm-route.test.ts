import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

import { GET } from "@/app/auth/confirm/route";

describe("auth confirmation route", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
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
    expect(response.headers.get("location")).toBe("https://www.munshios.tech/onboarding");
  });

  it("blocks external redirect destinations", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        "https://www.munshios.tech/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe("https://www.munshios.tech/onboarding");
  });

  it("sends invalid or expired tokens to a recoverable sign-in state", async () => {
    verifyOtp.mockResolvedValue({ error: new Error("expired") });
    const response = await GET(
      new Request("https://www.munshios.tech/auth/confirm?token_hash=abc&type=signup"),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.munshios.tech/sign-in?confirmation_error=expired",
    );
  });
});
