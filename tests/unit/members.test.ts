import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    workspaceInvitation: { findMany: mocks.findMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      workspaceInvitation: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
      workspaceMember: { upsert: mocks.upsert },
    })),
  },
}));
vi.mock("@/lib/server/audit", () => ({ writeAudit: mocks.writeAudit }));

import {
  acceptInvitationForUser,
  declineInvitationForUser,
  listPendingInvitationsForEmail,
  revokeInvitation,
} from "@/lib/server/members";

describe("invitation consent and lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only live pending invitations for the normalized verified email", async () => {
    mocks.findMany.mockResolvedValue([]);
    await listPendingInvitationsForEmail(" Invitee@Example.com ");

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { email: "invitee@example.com", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        workspace: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  });

  it("creates membership only after the matching verified user explicitly accepts", async () => {
    mocks.findFirst.mockResolvedValue({ id: "invite_1", workspaceId: "workspace_1", role: "ADMIN" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.upsert.mockResolvedValue({ id: "member_1" });

    await expect(acceptInvitationForUser("user_1", " Invitee@Example.com ", "invite_1"))
      .resolves.toEqual({ workspaceId: "workspace_1" });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "invite_1", email: "invitee@example.com", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      select: { id: true, workspaceId: true, role: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "invite_1", email: "invitee@example.com", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      data: { status: "ACCEPTED", acceptedAt: expect.any(Date) },
    });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace_1", userId: "user_1" } },
      create: { workspaceId: "workspace_1", userId: "user_1", role: "ADMIN" },
      update: {},
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "user_1",
      action: "member.joined",
      entityId: "invite_1",
    }));
  });

  it("does not grant membership when the invitation does not match the user's verified email", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(acceptInvitationForUser("user_1", "other@example.com", "invite_1"))
      .rejects.toThrow("does not match your verified email");

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not grant membership when revocation wins the acceptance claim", async () => {
    mocks.findFirst.mockResolvedValue({ id: "invite_1", workspaceId: "workspace_1", role: "ADMIN" });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(acceptInvitationForUser("user_1", "invitee@example.com", "invite_1"))
      .rejects.toThrow("no longer pending");

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("allows the matching verified user to decline without creating membership", async () => {
    mocks.findFirst.mockResolvedValue({ id: "invite_1", workspaceId: "workspace_1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await declineInvitationForUser("user_1", "invitee@example.com", "invite_1");

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "invite_1", email: "invitee@example.com", status: "PENDING" },
      data: { status: "REVOKED" },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "user_1",
      action: "member.invitation_declined",
    }));
  });

  it("revokes only a pending invitation in the active workspace", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await revokeInvitation({ workspaceId: "workspace_1", userId: "owner_1", role: "OWNER" }, "invite_1");

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "invite_1", workspaceId: "workspace_1", status: "PENDING" },
      data: { status: "REVOKED" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("rejects revocation when the scoped pending invitation does not exist", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(revokeInvitation({ workspaceId: "workspace_1", userId: "owner_1", role: "OWNER" }, "invite_1"))
      .rejects.toThrow("no longer pending");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
