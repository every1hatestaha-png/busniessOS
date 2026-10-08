import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifiedOwner: vi.fn(),
  genericCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/server/platform-security", () => ({
  getVerifiedPlatformOwnerIdentity: mocks.verifiedOwner,
}));
vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: mocks.genericCurrentUser,
  requireWorkspace: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  db: {
    user: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      update: mocks.update,
      create: mocks.create,
    },
  },
}));

import { requirePlatformOwner } from "@/lib/server/subscriptions";

const clerkOwner = {
  id: "clerk-platform-owner",
  primaryEmailAddressId: "email-owner",
  emailAddresses: [{
    id: "email-owner",
    emailAddress: "OWNER@EXAMPLE.INVALID",
    verification: { status: "verified" },
  }],
  firstName: "Platform",
  lastName: "Owner",
};

const localOwner = {
  id: "local-platform-owner",
  clerkId: clerkOwner.id,
  supabaseId: null,
  email: "owner@example.invalid",
  firstName: "Platform",
  lastName: "Owner",
};

describe("platform owner local identity binding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifiedOwner.mockResolvedValue(clerkOwner);
    mocks.genericCurrentUser.mockResolvedValue({
      id: "unrelated-supabase-user",
      email: "customer@example.invalid",
    });
  });

  it("uses the verified Clerk owner row even if another Supabase user is active", async () => {
    mocks.findUnique.mockResolvedValue(localOwner);

    await expect(requirePlatformOwner()).resolves.toEqual(localOwner);

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { clerkId: clerkOwner.id } });
    expect(mocks.genericCurrentUser).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("links an existing verified owner email to Clerk without using the Supabase browser actor", async () => {
    const legacyOwner = {
      ...localOwner,
      clerkId: "supabase:legacy-owner",
      supabaseId: "supabase-owner",
    };
    const linkedOwner = { ...legacyOwner, clerkId: clerkOwner.id };

    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.findFirst.mockResolvedValueOnce(legacyOwner);
    mocks.update.mockResolvedValueOnce(linkedOwner);

    await expect(requirePlatformOwner()).resolves.toEqual(linkedOwner);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: legacyOwner.id },
      data: {
        clerkId: clerkOwner.id,
        email: "owner@example.invalid",
        firstName: "Platform",
        lastName: "Owner",
      },
    });
    expect(mocks.genericCurrentUser).not.toHaveBeenCalled();
  });

  it("creates a local audit identity from the verified Clerk owner when none exists", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.findFirst.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce(localOwner);

    await expect(requirePlatformOwner()).resolves.toEqual(localOwner);

    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        clerkId: clerkOwner.id,
        email: "owner@example.invalid",
        firstName: "Platform",
        lastName: "Owner",
      },
    });
    expect(mocks.genericCurrentUser).not.toHaveBeenCalled();
  });
});
