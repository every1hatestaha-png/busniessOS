import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getOptionalCurrentUser: mocks.user }));
vi.mock("@/lib/server/db", () => ({ db: { user: { findUnique: mocks.find, update: mocks.update } } }));
import { POST } from "@/app/api/legal/acceptance/route";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";

const origin = "https://staging.example.invalid";
const accepted = {
  termsAcceptedAt: new Date("2026-10-07T12:00:00Z"), termsVersion: "2026-10-07",
  privacyAcknowledgedAt: new Date("2026-10-07T12:00:00Z"), privacyVersion: "2026-10-07",
};

describe("durable policy acceptance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "authenticated-user" });
    mocks.find.mockResolvedValue({ termsAcceptedAt: null, privacyAcknowledgedAt: null });
    mocks.update.mockResolvedValue(accepted);
  });

  it.each(["https://evil.example.invalid", "http://localhost:8081", "null"])("rejects cross-origin %s before authentication or writes", async attacker => {
    const response = await POST(new Request(`${origin}/api/legal/acceptance`, { method: "POST", headers: { origin: attacker } }));
    expect(response.status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a cross-site form whose Origin is absent", async () => {
    expect((await POST(new Request(`${origin}/api/legal/acceptance`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns JSON 401 for a missing authenticated user without writes", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await POST(new Request(`${origin}/api/legal/acceptance`, { method: "POST", headers: { origin } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("writes exact versions and server timestamps only for the authenticated user, ignoring body IDs", async () => {
    const response = await POST(new Request(`${origin}/api/legal/acceptance`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ userId: "victim", termsVersion: "invented", termsAcceptedAt: "1900-01-01" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const write = mocks.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: "authenticated-user" });
    expect(write.data).toEqual({ termsAcceptedAt: expect.any(Date), termsVersion: "2026-10-07", privacyAcknowledgedAt: expect.any(Date), privacyVersion: "2026-10-07" });
    expect(write.data.termsAcceptedAt).toEqual(write.data.privacyAcknowledgedAt);
  });

  it("preserves the existing timestamps on repeated acceptance", async () => {
    mocks.find.mockResolvedValue(accepted);
    expect(await recordCurrentPolicyAcceptance("authenticated-user")).toEqual(accepted);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates an outdated policy version but never provisions a missing local user", async () => {
    mocks.find.mockResolvedValue({ ...accepted, termsVersion: "2026-10-01" });
    await recordCurrentPolicyAcceptance("authenticated-user");
    expect(mocks.update).toHaveBeenCalledOnce();
    mocks.find.mockResolvedValue(null);
    await expect(recordCurrentPolicyAcceptance("missing")).rejects.toThrow("User not found.");
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
