import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies, getSupabasePublicConfig, createServerClient } = vi.hoisted(() => ({
  cookies: vi.fn(),
  getSupabasePublicConfig: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { createSupabaseServerClient } from "@/lib/supabase/server";

describe("Supabase server request initialization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cookies.mockResolvedValue({ getAll: vi.fn(() => []), set: vi.fn() });
    getSupabasePublicConfig.mockReturnValue({ url: "https://example.supabase.co", publishableKey: "synthetic-key" });
  });

  it("lets Next.js defer prerendering before checking request-only auth configuration", async () => {
    const dynamicRequest = new Error("Next.js prerender requires a request context");
    cookies.mockRejectedValue(dynamicRequest);
    getSupabasePublicConfig.mockImplementation(() => { throw new Error("missing config"); });

    await expect(createSupabaseServerClient()).rejects.toBe(dynamicRequest);
    expect(getSupabasePublicConfig).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("still fails closed for an actual request with missing auth configuration", async () => {
    const missingConfig = new Error("Supabase auth is not configured");
    getSupabasePublicConfig.mockImplementation(() => { throw missingConfig; });

    await expect(createSupabaseServerClient()).rejects.toBe(missingConfig);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("passes request cookies to the configured client", async () => {
    const cookieStore = { getAll: vi.fn(() => [{ name: "synthetic-session", value: "synthetic" }]), set: vi.fn() };
    cookies.mockResolvedValue(cookieStore);
    createServerClient.mockReturnValue({ auth: {} });

    await createSupabaseServerClient();
    const adapter = createServerClient.mock.calls[0][2].cookies;
    expect(adapter.getAll()).toEqual([{ name: "synthetic-session", value: "synthetic" }]);
    adapter.setAll([{ name: "synthetic-session", value: "synthetic-new", options: { path: "/" } }]);
    expect(cookieStore.set).toHaveBeenCalledWith("synthetic-session", "synthetic-new", { path: "/" });
  });
});
