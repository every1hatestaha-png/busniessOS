import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({ users: { getUser: getUserMock } })),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
      create: createMock,
    },
  },
}));

import { requireApiUser } from "@/lib/server/api";

const localUser = {
  id: "local-user",
  clerkId: "clerk-user",
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "User",
};

function verifiedClerkUser(email = "owner@example.com") {
  return {
    firstName: "Owner",
    lastName: "User",
    primaryEmailAddressId: "primary-email",
    emailAddresses: [
      {
        id: "primary-email",
        emailAddress: email,
        verification: { status: "verified" },
      },
    ],
  };
}

describe("API authentication contract", () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
  });

  it.each(["oauth_token", "session_token"])(
    "accepts an authenticated %s request only after verifying current primary-email ownership",
    async (tokenType) => {
      authMock.mockResolvedValue({ userId: "clerk-user", tokenType });
      getUserMock.mockResolvedValue(verifiedClerkUser());
      findUniqueMock.mockResolvedValue(localUser);

      await expect(requireApiUser()).resolves.toEqual(localUser);
      expect(authMock).toHaveBeenCalledWith({
        acceptsToken: ["session_token", "oauth_token"],
      });
      expect(getUserMock).toHaveBeenCalledWith("clerk-user");
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { clerkId: "clerk-user" },
      });
      expect(updateMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it("provisions a new OAuth user only from a verified primary Clerk email", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getUserMock.mockResolvedValue(verifiedClerkUser());
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    createMock.mockResolvedValue(localUser);

    await expect(requireApiUser()).resolves.toEqual(localUser);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk-user",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
  });

  it("links an existing verified-email user to the current Clerk identity", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getUserMock.mockResolvedValue(verifiedClerkUser());
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...localUser, clerkId: "old-clerk-user" });
    updateMock.mockResolvedValue(localUser);

    await expect(requireApiUser()).resolves.toEqual(localUser);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "local-user" },
      data: {
        clerkId: "clerk-user",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
  });

  it("rejects an unverified primary email even when a local user row already exists", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getUserMock.mockResolvedValue({
      ...verifiedClerkUser(),
      emailAddresses: [{
        id: "primary-email",
        emailAddress: "owner@example.com",
        verification: { status: "unverified" },
      }],
    });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("rejects verified-email relinking when another local user owns the email", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getUserMock.mockResolvedValue(verifiedClerkUser("new@example.com"));
    findUniqueMock
      .mockResolvedValueOnce(localUser)
      .mockResolvedValueOnce({ ...localUser, id: "other-user", clerkId: "other-clerk", email: "new@example.com" });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_ALREADY_LINKED",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects requests without a supported Clerk identity", async () => {
    authMock.mockResolvedValue({ userId: null, tokenType: null });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    });
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
