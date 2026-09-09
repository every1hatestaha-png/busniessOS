import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({ users: { getUser: getUserMock } })),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
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

describe("API authentication contract", () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserMock.mockReset();
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it.each(["oauth_token", "session_token"])(
    "accepts an authenticated %s request",
    async (tokenType) => {
      authMock.mockResolvedValue({ userId: "clerk-user", tokenType });
      findUniqueMock.mockResolvedValue(localUser);

      await expect(requireApiUser()).resolves.toEqual(localUser);
      expect(authMock).toHaveBeenCalledWith({
        acceptsToken: ["session_token", "oauth_token"],
      });
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { clerkId: "clerk-user" },
      });
    },
  );

  it("provisions an OAuth user through the Clerk backend client", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    findUniqueMock.mockResolvedValue(null);
    getUserMock.mockResolvedValue({
      firstName: "Owner",
      lastName: "User",
      primaryEmailAddressId: "primary-email",
      emailAddresses: [
        { id: "primary-email", emailAddress: "owner@example.com" },
      ],
    });
    upsertMock.mockResolvedValue(localUser);

    await expect(requireApiUser()).resolves.toEqual(localUser);
    expect(getUserMock).toHaveBeenCalledWith("clerk-user");
    expect(upsertMock).toHaveBeenCalledWith({
      where: { clerkId: "clerk-user" },
      create: {
        clerkId: "clerk-user",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
      update: {
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
  });

  it("rejects requests without a supported Clerk identity", async () => {
    authMock.mockResolvedValue({ userId: null, tokenType: null });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
