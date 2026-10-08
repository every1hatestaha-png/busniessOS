import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  provider: vi.fn(), find: vi.fn(), byEmail: vi.fn(), memberships: vi.fn(),
  memoizers: [] as Array<Map<string, unknown>>,
}));
vi.mock("react", () => ({ cache: (fn: (...args: unknown[]) => unknown) => {
  const values = new Map<string, unknown>(); mocks.memoizers.push(values);
  return (...args: unknown[]) => { const key = JSON.stringify(args); if (!values.has(key)) values.set(key, fn(...args)); return values.get(key); };
} }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({})), clerkClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined })), headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAuthUser: mocks.provider }));
vi.mock("@/lib/server/db", () => ({ db: { user: { findUnique: mocks.find, findFirst: mocks.byEmail }, workspaceMember: { findMany: mocks.memberships } } }));
import { GET } from "@/app/auth/post-login/route";
import { getCurrentWorkspace, listCurrentUserWorkspaces } from "@/lib/server/auth";

const origin = "https://staging.example.invalid";
const local = {
  id: "local-owner",
  email: "synthetic@example.invalid",
  firstName: null,
  lastName: null,
  termsAcceptedAt: new Date("2026-10-07T12:00:00.000Z"),
  termsVersion: "2026-10-07",
  privacyAcknowledgedAt: new Date("2026-10-07T12:00:00.000Z"),
  privacyVersion: "2026-10-07",
};
const membership = (id: string, vertical = "RESTAURANT") => ({ workspaceId: id, role: "OWNER", restaurantStation: "ALL", workspace: { id, name: "Synthetic", vertical } });
const open = (next = "") => GET(new Request(`${origin}/auth/post-login${next ? `?next=${encodeURIComponent(next)}` : ""}`));

describe("canonical Supabase post-login workspace routing", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.memoizers.forEach(m => m.clear()); mocks.cookie = undefined;
    mocks.provider.mockResolvedValue({ id: "provider-owner", email: local.email, email_confirmed_at: "2026-10-07", user_metadata: {} });
    mocks.find.mockResolvedValue(local); mocks.byEmail.mockResolvedValue(local);
    mocks.memberships.mockResolvedValue([membership("owned-a")]);
  });
  it.each(["RESTAURANT", "TRADING", "LEGACY", "MANUFACTURING"])("uses the registry home for %s", async vertical => {
    mocks.memberships.mockResolvedValue([membership("owned-a", vertical)]);
    const response = await open();
    expect(response.headers.get("location")).toBe(origin + (vertical === "RESTAURANT" ? "/restaurant" : "/dashboard"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.cookies.get("businessos_workspace")?.value).toBe("owned-a");
  });
  it("requires current policy acceptance before workspace resolution", async () => {
    const unaccepted = {
      ...local,
      termsAcceptedAt: null,
      termsVersion: null,
      privacyAcknowledgedAt: null,
      privacyVersion: null,
    };
    mocks.find.mockResolvedValue(unaccepted);
    mocks.byEmail.mockResolvedValue(unaccepted);
    const response = await open();
    expect(response.headers.get("location")).toBe(origin + "/legal/acceptance");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.memberships).not.toHaveBeenCalled();
  });
  it("blocks direct workspace resolution before current policy acceptance", async () => {
    const unaccepted = {
      ...local,
      termsAcceptedAt: null,
      termsVersion: null,
      privacyAcknowledgedAt: null,
      privacyVersion: null,
    };
    mocks.find.mockResolvedValue(unaccepted);
    mocks.byEmail.mockResolvedValue(unaccepted);

    await expect(getCurrentWorkspace()).rejects.toThrow("redirect:/legal/acceptance");
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("routes a verified user without memberships to onboarding", async () => {
    mocks.memberships.mockResolvedValue([]);
    expect((await open("/restaurant")).headers.get("location")).toBe(origin + "/onboarding");
  });
  it.each([null, { id: "pending", email_confirmed_at: null }])("requires a confirmed Supabase session", async provider => {
    mocks.provider.mockResolvedValue(provider);
    expect((await open()).headers.get("location")).toBe(origin + "/sign-in");
    expect(mocks.memberships).not.toHaveBeenCalled();
  });
  it("honors the active cookie only inside the current user's memberships", async () => {
    mocks.cookie = "owned-b";
    mocks.memberships.mockResolvedValue([membership("owned-a", "TRADING"), membership("owned-b")]);
    expect((await open()).headers.get("location")).toBe(origin + "/restaurant");
    expect(mocks.memberships).toHaveBeenCalledWith({ where: { userId: local.id }, orderBy: [{ createdAt: "asc" }, { workspaceId: "asc" }], select: { workspaceId: true, role: true, restaurantStation: true, workspace: true } });
  });
  it.each(["foreign-workspace", "stale-workspace"])("repairs an invalid active cookie %s without selecting that tenant", async cookie => {
    mocks.cookie = cookie;
    const response = await open();
    expect(response.cookies.get("businessos_workspace")?.value).toBe("owned-a");
    expect(response.headers.get("location")).toBe(origin + "/restaurant");
  });
  it.each(["https://evil.example", "//evil.example", "/sign-in", "/auth/post-login"])("rejects unsafe or looping next %s", async next => {
    expect((await open(next)).headers.get("location")).toBe(origin + "/restaurant");
  });
  it("preserves safe explicit navigation after workspace resolution", async () => {
    expect((await open("/inventory?view=stock")).headers.get("location")).toBe(origin + "/inventory?view=stock");
  });
  it("preserves unavailable vertical handling", async () => {
    mocks.memberships.mockResolvedValue([membership("owned-a", "PROPERTY")]);
    await expect(open()).rejects.toThrow("redirect:/workspace-unavailable");
  });
  it("shares a membership read inside one request, but not between requests", async () => {
    await open(); await listCurrentUserWorkspaces();
    expect(mocks.memberships).toHaveBeenCalledTimes(1);
    mocks.memoizers.forEach(m => m.clear());
    await open();
    expect(mocks.memberships).toHaveBeenCalledTimes(2);
  });
});
