import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), create: vi.fn(), clerk: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => mocks.clerk }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: () => ({ url: "https://example.supabase.co", publishableKey: "synthetic" }) }));
import { proxy } from "@/proxy";
const open = async (path: string, cookie?: string) => {
  const response = await proxy(new NextRequest(`https://staging.example.invalid${path}`, { headers: cookie ? { cookie } : {} }), {} as NextFetchEvent);
  if (!response) throw new Error("Proxy returned no response.");
  return response;
};
describe("Proxy session-validation performance and boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockReturnValue({ auth: { getClaims: mocks.claims } });
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "synthetic-user" } }, error: null });
  });
  it.each(["/", "/sign-in", "/sign-up", "/privacy"])("skips provider validation for signed-out %s", async path => {
    expect((await open(path)).status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.clerk).not.toHaveBeenCalled();
  });
  it("validates one claims call on signed-in navigation without Clerk or trusting cookie contents", async () => {
    expect((await open("/restaurant", "sb-example-auth-token=untrusted-cookie" )).status).toBe(200);
    expect(mocks.claims).toHaveBeenCalledOnce();
    expect(mocks.clerk).not.toHaveBeenCalled();
  });
  it("fails closed when claims validation fails", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: new Error("expired") });
    const response = await open("/restaurant", "sb-example-auth-token=expired");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in?redirect_url=");
  });
});
