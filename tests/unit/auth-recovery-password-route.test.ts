import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn(), updateUser: vi.fn(), marker: vi.fn(), clear: vi.fn(), login: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims, updateUser: mocks.updateUser } }) }));
vi.mock("@/lib/server/recovery-session", () => ({ hasRecoveryMarker: mocks.marker, clearRecoveryMarker: mocks.clear }));
import { POST } from "@/app/auth/recovery/password/route";
const password = "SyntheticNewPassword!123";
const request = () => new Request("https://staging.example.invalid/auth/recovery/password", { method: "POST", body: JSON.stringify({ password }) });
describe("password recovery update guards", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.marker.mockResolvedValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-07" } }, error: null });
    mocks.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
  });
  it("updates the password only with fresh proof and clears the marker", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({ password });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it.each(["missing marker", "unconfirmed", "password auth", "expired proof"])("rejects %s without changing the password", async state => {
    if (state === "missing marker") mocks.marker.mockResolvedValue(false);
    if (state === "unconfirmed") mocks.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    if (state === "password auth") mocks.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    if (state === "expired proof") mocks.getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) - 601 }] } }, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
