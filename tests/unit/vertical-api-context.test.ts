import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(), user: vi.fn(), findFirst: vi.fn(), access: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/server/auth", () => ({ getOptionalCurrentUser: mocks.user }));
vi.mock("@/lib/server/db", () => ({ db: { workspaceMember: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/server/subscriptions", () => ({ getWorkspaceAccess: mocks.access }));

import { requireApiContext } from "@/lib/server/api";

describe("API context selects a trusted tenant and persisted vertical", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-A", email: "a@example.com", firstName: null, lastName: null });
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "workspace-B" }) });
    mocks.access.mockResolvedValue({ allowed: true });
    mocks.findFirst.mockResolvedValue({ workspaceId: "workspace-B", role: "STAFF", workspace: { id: "workspace-B", businessType: "OTHER", vertical: "LEGACY" } });
  });

  it("scopes membership lookup to both authenticated user and active workspace", async () => {
    const context = await requireApiContext("business.read");
    expect(context).toMatchObject({ workspaceId: "workspace-B", role: "STAFF", vertical: "LEGACY" });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-A", workspaceId: "workspace-B" },
    }));
  });

  it("rejects a foreign workspace without membership and denies mutation by role", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "WORKSPACE_REQUIRED" });
    await expect(requireApiContext("financial.manage")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("rejects a persisted unavailable vertical even if membership exists", async () => {
    mocks.findFirst.mockResolvedValueOnce({ workspaceId: "workspace-B", role: "OWNER", workspace: { id: "workspace-B", vertical: "PROPERTY" } });
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "VERTICAL_UNAVAILABLE" });
  });
});
