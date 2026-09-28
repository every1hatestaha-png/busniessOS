import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  findMembership: vi.fn(),
  getOptionalCurrentUser: vi.fn(),
  getWorkspaceAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookiesGet }),
}));
vi.mock("@/lib/server/auth", () => ({
  getOptionalCurrentUser: mocks.getOptionalCurrentUser,
}));
vi.mock("@/lib/server/db", () => ({
  db: { workspaceMember: { findFirst: mocks.findMembership } },
}));
vi.mock("@/lib/server/subscriptions", () => ({
  getWorkspaceAccess: mocks.getWorkspaceAccess,
}));
vi.mock("@/lib/server/error-monitoring", () => ({ reportServerFailure: vi.fn() }));

import { ApiError, requireApiContext } from "@/lib/server/api";

const user = { id: "user-1", email: "owner@example.com", firstName: "Owner", lastName: "One" };
const workspace = {
  id: "0f2730ee-635b-4d5a-b95f-9282ab09a311",
  name: "Workspace A",
  phone: null,
  email: null,
  address: null,
  city: null,
  country: "Pakistan",
  currency: "PKR",
  timezone: "Asia/Karachi",
  businessType: "WHOLESALER",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOptionalCurrentUser.mockResolvedValue(user);
  mocks.getWorkspaceAccess.mockResolvedValue({ allowed: true });
});

describe("API workspace isolation", () => {
  it("binds the API context lookup to the active workspace cookie", async () => {
    mocks.cookiesGet.mockReturnValue({ value: workspace.id });
    mocks.findMembership.mockResolvedValue({ workspaceId: workspace.id, role: "OWNER", workspace });

    const context = await requireApiContext("business.read");

    expect(context.workspaceId).toBe(workspace.id);
    expect(mocks.findMembership).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id, workspaceId: workspace.id },
    }));
  });

  it("rejects an active workspace when the authenticated user has no membership there", async () => {
    const foreignWorkspaceId = "7e8c673f-655b-4a68-95cc-cb55ed4f299e";
    mocks.cookiesGet.mockReturnValue({ value: foreignWorkspaceId });
    mocks.findMembership.mockResolvedValue(null);

    await expect(requireApiContext("business.read")).rejects.toMatchObject<ApiError>({
      status: 403,
      code: "WORKSPACE_REQUIRED",
    });
    expect(mocks.findMembership).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id, workspaceId: foreignWorkspaceId },
    }));
  });

  it("does not grant a STAFF member a financial permission", async () => {
    mocks.cookiesGet.mockReturnValue({ value: workspace.id });
    mocks.findMembership.mockResolvedValue({ workspaceId: workspace.id, role: "STAFF", workspace });

    await expect(requireApiContext("financial.manage")).rejects.toMatchObject<ApiError>({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(mocks.getWorkspaceAccess).not.toHaveBeenCalled();
  });
});
