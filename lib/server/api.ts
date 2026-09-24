import "server-only";

import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z, ZodError, type ZodType } from "zod";

import { canPerformAction, type Permission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

export type ApiContext = {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  workspace: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    country: string;
    currency: string;
    timezone: string;
    businessType: string;
    createdAt: Date;
    updatedAt: Date;
  };
  workspaceId: string;
  role: Role;
};

export class ApiError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireApiUser() {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  // API access must prove current verified primary-email ownership on every
  // authenticated request, exactly like the server-rendered application path.
  // A lifecycle webhook-created local row is not sufficient authorization.
  const clerkUser = await (await clerkClient()).users.getUser(userId);
  const primaryEmailAddress = clerkUser.primaryEmailAddressId
    ? clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)
    : undefined;
  const primaryEmail = primaryEmailAddress?.emailAddress?.trim().toLowerCase();

  if (!primaryEmail) {
    throw new ApiError(403, "USER_EMAIL_REQUIRED", "A verified primary email address is required.");
  }
  if (primaryEmailAddress.verification?.status !== "verified") {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Verify your primary email address before using the MunshiOS API.");
  }

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    if (
      existing.email === primaryEmail
      && existing.firstName === clerkUser.firstName
      && existing.lastName === clerkUser.lastName
    ) {
      return existing;
    }

    const conflictingEmailOwner = await db.user.findUnique({ where: { email: primaryEmail } });
    if (conflictingEmailOwner && conflictingEmailOwner.id !== existing.id) {
      throw new ApiError(409, "EMAIL_ALREADY_LINKED", "This verified email is already linked to another MunshiOS user.");
    }

    return db.user.update({
      where: { id: existing.id },
      data: {
        email: primaryEmail,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
    });
  }

  const existingByEmail = await db.user.findUnique({ where: { email: primaryEmail } });
  if (existingByEmail) {
    return db.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkId: userId,
        email: primaryEmail,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
    });
  }

  return db.user.create({
    data: {
      clerkId: userId,
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
    },
  });
}

export async function requireApiContext(permission?: Permission): Promise<ApiContext> {
  const localUser = await requireApiUser();
  const activeWorkspaceId = (await cookies()).get("businessos_workspace")?.value;
  const membership = await db.workspaceMember.findFirst({
    where: { userId: localUser.id, ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      workspaceId: true,
      role: true,
      workspace: true,
    },
  });

  if (!membership) {
    throw new ApiError(403, "WORKSPACE_REQUIRED", "A workspace membership is required.");
  }
  if (permission && !canPerformAction(membership.role, permission)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }

  // Preserve read-only access after expiry while blocking all permissions that
  // can mutate workspace or financial state.
  if (permission && permission !== "business.read") {
    const access = await getWorkspaceAccess(membership.workspaceId);
    if (!access.allowed) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_REQUIRED",
        access.reason === "suspended"
          ? "This workspace is suspended."
          : "The workspace trial or subscription has expired.",
      );
    }
  }

  return {
    user: {
      id: localUser.id,
      email: localUser.email,
      firstName: localUser.firstName,
      lastName: localUser.lastName,
    },
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export async function parseApiBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(422, "INVALID_JSON", "The request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) throw new ApiError(422, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required for this financial operation.");
  return key;
}

export function apiData<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: z.prettifyError(error) } },
      { status: 422 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A record with those details already exists." } },
        { status: 409 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
        { status: 404 },
      );
    }
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export function apiHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
) {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiError(error);
    }
  };
}
