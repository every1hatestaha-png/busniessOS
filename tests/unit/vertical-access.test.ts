import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  listWorkspaceModules: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/server/industry-modules", () => ({ listWorkspaceModules: mocks.listWorkspaceModules }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import { requireVerticalRoute } from "@/lib/server/vertical-access";

describe("trusted route entry guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspace.mockResolvedValue({ workspaceId: "active-tenant", role: "STAFF", vertical: "TRADING" });
    mocks.listWorkspaceModules.mockResolvedValue([]);
  });

  it("checks modules using the authenticated active workspace", async () => {
    await expect(requireVerticalRoute("/manufacturing")).rejects.toThrow("NOT_FOUND");
    expect(mocks.listWorkspaceModules).toHaveBeenCalledWith("active-tenant");
    mocks.listWorkspaceModules.mockResolvedValue([{ moduleKey: "manufacturing", enabled: true }]);
    await expect(requireVerticalRoute("/manufacturing")).resolves.toMatchObject({ workspaceId: "active-tenant", role: "STAFF" });
  });

  it("denies an unavailable vertical even with a module flag", async () => {
    mocks.requireWorkspace.mockResolvedValue({ workspaceId: "active-tenant", vertical: "PROPERTY" });
    mocks.listWorkspaceModules.mockResolvedValue([{ moduleKey: "manufacturing", enabled: true }]);
    await expect(requireVerticalRoute("/manufacturing")).rejects.toThrow("NOT_FOUND");
  });
});
