import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  txFindUnique: vi.fn(),
  txUpdate: vi.fn(),
  txCreate: vi.fn(),
  userDelete: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      delete: mocks.userDelete,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      user: {
        findUnique: mocks.txFindUnique,
        update: mocks.txUpdate,
        create: mocks.txCreate,
      },
    })),
  },
}));

import { ClerkUserSyncConflictError, syncClerkLifecycleIdentity } from "@/lib/server/clerk-user-sync";

const identity = {
  id: "clerk_1",
  email: "owner@example.com",
  verifiedPrimaryEmail: "owner@example.com",
  firstName: "Owner",
  lastName: "User",
};

describe("Clerk lifecycle identity sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never creates or updates a local identity from an unverified email", async () => {
    await expect(syncClerkLifecycleIdentity("user.created", {
      ...identity,
      verifiedPrimaryEmail: null,
    })).resolves.toEqual({
      synced: false,
      reason: "verified_email_required",
    });

    expect(mocks.txFindUnique).not.toHaveBeenCalled();
    expect(mocks.txCreate).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("preserves an owner identity when the external Clerk account is deleted", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user_1",
      memberships: [{ role: "OWNER" }, { role: "ADMIN" }],
    });

    await expect(syncClerkLifecycleIdentity("user.deleted", {
      ...identity,
      email: null,
      verifiedPrimaryEmail: null,
    })).resolves.toEqual({
      synced: false,
      reason: "owner_preserved",
    });

    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("removes a deleted non-owner identity and its memberships through the existing cascade", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user_2",
      memberships: [{ role: "STAFF" }],
    });
    mocks.userDelete.mockResolvedValue({ id: "user_2" });

    await expect(syncClerkLifecycleIdentity("user.deleted", {
      ...identity,
      email: null,
      verifiedPrimaryEmail: null,
    })).resolves.toEqual({
      synced: true,
      action: "deleted",
    });

    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "user_2" } });
  });

  it("relinks a recreated verified Clerk identity to the existing email owner", async () => {
    mocks.txFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user_1",
        clerkId: "deleted_clerk",
        email: "owner@example.com",
      });
    mocks.txUpdate.mockResolvedValue({ id: "user_1" });

    const result = await syncClerkLifecycleIdentity("user.created", identity);

    expect(result).toMatchObject({ synced: true, action: "relinked" });
    expect(mocks.txUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        clerkId: "clerk_1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
  });

  it("rejects ambiguous identity conflicts instead of merging two local users", async () => {
    mocks.txFindUnique
      .mockResolvedValueOnce({ id: "user_by_clerk", clerkId: "clerk_1" })
      .mockResolvedValueOnce({ id: "user_by_email", email: "owner@example.com" });

    await expect(syncClerkLifecycleIdentity("user.updated", identity))
      .rejects.toBeInstanceOf(ClerkUserSyncConflictError);

    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates a local identity only when the verified Clerk identity has no existing link", async () => {
    mocks.txFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.txCreate.mockResolvedValue({ id: "user_3" });

    const result = await syncClerkLifecycleIdentity("user.created", identity);

    expect(result).toMatchObject({ synced: true, action: "created" });
    expect(mocks.txCreate).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk_1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
  });
});
