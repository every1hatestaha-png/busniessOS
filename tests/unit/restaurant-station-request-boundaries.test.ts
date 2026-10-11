import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ path: "", station: "POS", role: "STAFF", membership: true, provider: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({}), clerkClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAuthUser: m.provider }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("redirect:" + path); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "workspace-a" }) }), headers: async () => new Headers(m.path ? { "x-munshios-internal-path": m.path } : {}) }));
vi.mock("@/lib/server/subscriptions", () => ({ getWorkspaceAccess: async () => ({ allowed: true }) }));
vi.mock("@/lib/server/db", () => {
  const user = { id: "user-a", email: "synthetic@example.invalid", firstName: null, lastName: null, termsAcceptedAt: new Date(), termsVersion: "2026-10-07", privacyAcknowledgedAt: new Date(), privacyVersion: "2026-10-07" };
  const member = () => ({ workspaceId: "workspace-a", role: m.role, restaurantStation: m.station, workspace: { id: "workspace-a", name: "Synthetic", vertical: "RESTAURANT" } });
  return { db: { user: { findUnique: async () => user, findFirst: async () => user }, workspaceMember: { findMany: async () => m.membership ? [member()] : [], findFirst: async () => m.membership ? member() : null } } };
});
import { requireWorkspace } from "@/lib/server/auth";
import { requireApiContext } from "@/lib/server/api";

describe("persisted station gates on page and API entry points", () => {
  beforeEach(() => {
    m.path = ""; m.station = "POS"; m.role = "STAFF"; m.membership = true;
    m.provider.mockResolvedValue({ id: "provider-a", email: "synthetic@example.invalid", email_confirmed_at: "2026-10-08", user_metadata: {} });
  });
  it.each(["POS", "KITCHEN"])("%s STAFF cannot open settings, reports or ERP APIs via a direct request", async station => {
    m.station = station;
    for (const path of ["/settings", "/reports", "/sales", "/restaurant/menu", "/api/v1/sales", "/api/v1/products", ""]) {
      m.path = path;
      await expect(requireWorkspace()).rejects.toThrow("redirect:/restaurant/");
      await expect(requireApiContext("business.read")).rejects.toMatchObject({ status: 403, code: "STATION_FORBIDDEN" });
    }
  });
  it.each(["POS", "KITCHEN"])("permits the matching %s page and private order print path", async station => {
    m.station = station;
    m.path = station === "POS" ? "/restaurant/pos" : "/restaurant/kitchen";
    await expect(requireWorkspace()).resolves.toMatchObject({ restaurantStation: station });
    m.path = "/restaurant/orders/12345678-1234-4234-8234-123456789abc/print";
    await expect(requireWorkspace()).resolves.toMatchObject({ restaurantStation: station });
  });
  it("uses changed persisted station and removed membership on the next request", async () => {
    m.path = "/restaurant/pos";
    await expect(requireWorkspace()).resolves.toBeTruthy();
    m.station = "KITCHEN";
    await expect(requireWorkspace()).rejects.toThrow("redirect:/restaurant/kitchen");
    m.membership = false;
    await expect(requireWorkspace()).rejects.toThrow("redirect:/onboarding");
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "WORKSPACE_REQUIRED" });
  });
  it.each(["OWNER", "ADMIN", "MANAGER"])("preserves %s access to allowed ERP APIs", async role => {
    m.role = role; m.path = "/api/v1/sales";
    await expect(requireApiContext("sales.create")).resolves.toMatchObject({ role, workspaceId: "workspace-a" });
  });
});
