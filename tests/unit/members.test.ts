import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    workspaceInvitation: { findMany: mocks.findMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      workspaceInvitation: { updateMany: mocks.updateMany },
      workspaceMember: { upsert: mocks.upsert },
    })),
  },
}));
vi.mock("@/lib/server/audit", () => ({ writeAudit: mocks.writeAudit }));

import { acceptPendingInvitations, revokeInvitation } from "@/lib/server/members";

describe("invitation acceptance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates membership only after atomically claiming a pending invitation", async () => {
    mocks.findMany.mockResolvedValue([{ id: "invite_1", workspaceId: "workspace_1", role: "ADMIN" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.upsert.mockResolvedValue({ id: "member_1" });

    await acceptPendingInvitations("user_1", " Invitee@Example.com ");

    expect(mocks.findMany).toHaveBeenCalledWith({ where: { email: "invitee@example.com", status: "PENDING", expiresAt: { gt: expect.any(Date) } } });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "invite_1", email: "invitee@example.com", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      data: { status: "ACCEPTED", acceptedAt: expect.any(Date) },
    });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace_1", userId: "user_1" } },
      create: { workspaceId: "workspace_1", userId: "user_1", role: "ADMIN" },
      update: {},
    });
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("does not grant membership when revocation wins the invitation claim", async () => {
    mocks.findMany.mockResolvedValue([{ id: "invite_1", workspaceId: "workspace_1", role: "ADMIN" }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await acceptPendingInvitations("user_1", "invitee@example.com");

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("revokes only a pending invitation in the active workspace", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await revokeInvitation({ workspaceId: "workspace_1", userId: "owner_1", role: "OWNER" }, "invite_1");

    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "invite_1", workspaceId: "workspace_1", status: "PENDING" }, data: { status: "REVOKED" } });
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("rejects revocation when the scoped pending invitation does not exist", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(revokeInvitation({ workspaceId: "workspace_1", userId: "owner_1", role: "OWNER" }, "invite_1")).rejects.toThrow("no longer pending");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
