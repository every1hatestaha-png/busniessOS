import { createRequire } from "node:module";
import { NextRequest, type NextFetchEvent } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => { process.env.CLERK_SECRET_KEY = ""; });
const m = vi.hoisted(() => ({ provider: vi.fn(), clerk: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => m.clerk }));
vi.mock("@supabase/ssr", () => ({ createServerClient: m.provider }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: () => ({ url: "https://example.supabase.co", publishableKey: "synthetic" }) }));
vi.mock("@/lib/request-rate-limit", () => ({ checkAppRateLimit: () => null }));
import { config, proxy } from "@/proxy";
const require = createRequire(import.meta.url);
const { webMutationInventory } = require("../../scripts/web-mutation-inventory.cjs");
const origin = "https://staging.example.invalid";

describe("Proxy protects all web mutation surfaces before provider I/O", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.provider.mockReturnValue({ auth: { getClaims: async () => ({ data: { claims: { sub: "synthetic" } }, error: null }) } });
  });
  it("matches every mutation route and server-action page, including formerly excluded recovery/desktop pages", () => {
    const inventory = webMutationInventory();
    for (const entry of [...inventory.routes, ...inventory.serverActions]) {
      const segments = entry.file.split("/").slice(1, -1).filter((part: string) => !part.startsWith("("));
      const pathname = "/" + segments.join("/").replace(/\[[^\]]+\]/g, "12345678-1234-4234-8234-123456789abc");
      expect(unstable_doesMiddlewareMatch({ config, url: origin + pathname }), entry.file).toBe(true);
    }
    for (const path of ["/forgot-password", "/account-recovery", "/recovery/new-password", "/desktop-auth"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: origin + path })).toBe(true);
    }
  });
  it.each(["/restaurant/pos", "/restaurant/kitchen", "/settings", "/platform", "/desktop-auth", "/recovery/new-password", "/api/ai/chat", "/api/v1/sales"])("denies missing web proof on %s", async path => {
    const response = await proxy(new NextRequest(origin + path, { method: "POST", headers: { cookie: "sb-example-auth-token=synthetic", "next-action": "synthetic-action" } }), {} as NextFetchEvent);
    expect(response?.status).toBe(403);
    expect(m.provider).not.toHaveBeenCalled();
    expect(m.clerk).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{}, { "sec-fetch-site": "cross-site" }, { origin: "https://evil.example.invalid" }])("blocks an attacker-added bearer when cookies are present: %j", async headers => {
    const response = await proxy(new NextRequest(origin + "/api/v1/sales", { method: "POST", headers: { ...headers, cookie: "__session=synthetic", authorization: "Bearer attacker" } }), {} as NextFetchEvent);
    expect(response?.status).toBe(403);
    expect(m.provider).not.toHaveBeenCalled();
  });
  it("forwards the actual path rather than a spoofed internal station path", async () => {
    const request = new NextRequest(origin + "/api/v1/sales", { headers: { "x-munshios-internal-path": "/restaurant/pos" } });
    const response = await proxy(request, {} as NextFetchEvent);
    expect(response?.headers.get("x-middleware-request-x-munshios-internal-path")).toBe("/api/v1/sales");
  });
  it("preserves positive browser mutations and does not block the independently signed webhook", async () => {
    expect((await proxy(new NextRequest(origin + "/restaurant/pos", { method: "POST", headers: { origin, "sec-fetch-site": "same-origin" } }), {} as NextFetchEvent))?.status).toBe(200);
    expect((await proxy(new NextRequest(origin + "/api/webhooks/clerk", { method: "POST" }), {} as NextFetchEvent))?.status).toBe(200);
    expect((await proxy(new NextRequest(origin + "/api/webhooks/clerk/other", { method: "POST" }), {} as NextFetchEvent))?.status).toBe(403);
  });
});
