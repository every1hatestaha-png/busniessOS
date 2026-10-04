import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_mock";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock";
});

const authMock = vi.hoisted(() => vi.fn());
const getClerkUserMock = vi.hoisted(() => vi.fn());
const getSupabaseAuthUserMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({ users: { getUser: getClerkUserMock } })),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAuthUser: getSupabaseAuthUserMock,
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      findFirst: findFirstMock,
      update: updateMock,
      create: createMock,
    },
  },
}));

import { requireApiUser } from "@/lib/server/api";

const localUser = {
  id: "local-user",
  clerkId: "clerk-user",
  supabaseId: null,
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

function verifiedSupabaseUser(email = "owner@example.com") {
  return {
    id: "supabase-user",
    email,
    email_confirmed_at: "2026-09-28T12:00:00.000Z",
    user_metadata: {
      first_name: "Owner",
      last_name: "User",
    },
  };
}

const insensitiveEmailLookup = (email: string) => ({
  where: {
    email: {
      equals: email,
      mode: "insensitive",
    },
  },
});

describe("API authentication contract", () => {
  beforeEach(() => {
    authMock.mockReset();
    getClerkUserMock.mockReset();
    getSupabaseAuthUserMock.mockReset();
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
    getSupabaseAuthUserMock.mockResolvedValue(null);
  });

  it("prefers a verified Supabase identity and preserves an existing local user id", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser());
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce({ ...localUser, clerkId: "legacy-clerk-user" });
    updateMock.mockResolvedValue({ ...localUser, clerkId: "legacy-clerk-user" });

    await expect(requireApiUser()).resolves.toMatchObject({ id: "local-user", email: "owner@example.com" });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { supabaseId: "supabase-user" },
    });
    expect(findFirstMock).toHaveBeenCalledWith(insensitiveEmailLookup("owner@example.com"));
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "local-user" },
      data: {
        supabaseId: "supabase-user",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("matches legacy mixed-case local emails without creating a duplicate user", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser("OWNER@EXAMPLE.COM"));
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce({ ...localUser, email: "Owner@Example.com", clerkId: "legacy-clerk-user" });
    updateMock.mockResolvedValue({ ...localUser, clerkId: "legacy-clerk-user" });

    await expect(requireApiUser()).resolves.toMatchObject({ id: "local-user" });
    expect(findFirstMock).toHaveBeenCalledWith(insensitiveEmailLookup("owner@example.com"));
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "local-user" },
      data: {
        supabaseId: "supabase-user",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a new local user for a new verified Supabase customer", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser("new@example.com"));
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValue({ ...localUser, clerkId: "supabase:supabase-user", email: "new@example.com" });

    await expect(requireApiUser()).resolves.toMatchObject({ email: "new@example.com" });
    expect(createMock).toHaveBeenCalledWith({
      data: {
        clerkId: "supabase:supabase-user",
        supabaseId: "supabase-user",
        email: "new@example.com",
        firstName: "Owner",
        lastName: "User",
      },
    });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("recovers when two first Supabase requests race to create the same local user", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser("new@example.com"));
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...localUser, clerkId: "supabase:supabase-user", supabaseId: "supabase-user", email: "new@example.com" });
    findFirstMock.mockResolvedValueOnce(null);
    createMock.mockRejectedValueOnce(new Error("unique constraint"));

    await expect(requireApiUser()).resolves.toMatchObject({
      id: "local-user",
      supabaseId: "supabase-user",
      email: "new@example.com",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).toHaveBeenNthCalledWith(2, {
      where: { supabaseId: "supabase-user" },
    });
  });

  it("does not attach a raced email winner that belongs to a different Supabase identity", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser("new@example.com"));
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...localUser,
        email: "new@example.com",
        supabaseId: "different-supabase-user",
      });
    createMock.mockRejectedValueOnce(new Error("unique constraint"));

    await expect(requireApiUser()).rejects.toThrow("unique constraint");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resolves an already-linked Supabase identity directly by provider id", async () => {
    getSupabaseAuthUserMock.mockResolvedValue(verifiedSupabaseUser());
    findUniqueMock.mockResolvedValueOnce({ ...localUser, clerkId: "legacy-clerk-user", supabaseId: "supabase-user" });
    findFirstMock.mockResolvedValueOnce({ ...localUser, clerkId: "legacy-clerk-user", supabaseId: "supabase-user" });

    await expect(requireApiUser()).resolves.toMatchObject({ id: "local-user" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("does not fall back to Clerk when a Supabase identity exists but its email is unverified", async () => {
    getSupabaseAuthUserMock.mockResolvedValue({
      ...verifiedSupabaseUser(),
      email_confirmed_at: null,
    });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it.each(["oauth_token", "session_token"])(
    "keeps verified Clerk %s support for explicit legacy paths",
    async (tokenType) => {
      authMock.mockResolvedValue({ userId: "clerk-user", tokenType });
      getClerkUserMock.mockResolvedValue(verifiedClerkUser());
      findUniqueMock.mockResolvedValueOnce(localUser);
      findFirstMock.mockResolvedValueOnce(localUser);

      await expect(requireApiUser()).resolves.toEqual(localUser);
      expect(authMock).toHaveBeenCalledWith({
        acceptsToken: ["session_token", "oauth_token"],
      });
      expect(getClerkUserMock).toHaveBeenCalledWith("clerk-user");
      expect(authMock).toHaveBeenCalledTimes(1);
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it("provisions a new legacy Clerk user only from a verified primary email", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getClerkUserMock.mockResolvedValue(verifiedClerkUser());
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce(null);
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

  it("links an existing verified-email local user to the current legacy Clerk identity", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getClerkUserMock.mockResolvedValue(verifiedClerkUser());
    findUniqueMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce({ ...localUser, clerkId: "old-clerk-user" });
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

  it("rejects an unverified legacy Clerk primary email without touching local user data", async () => {
    authMock.mockResolvedValue({ userId: "clerk-user", tokenType: "oauth_token" });
    getClerkUserMock.mockResolvedValue({
      ...verifiedClerkUser(),
      emailAddresses: [{
        id: "primary-email",
        emailAddress: "owner@example.com",
        verification: { status: "unverified" },
      }],
    });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("rejects requests without a supported Supabase or Clerk identity", async () => {
    authMock.mockResolvedValue({ userId: null, tokenType: null });

    await expect(requireApiUser()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    });
    expect(getClerkUserMock).not.toHaveBeenCalled();
  });
});
