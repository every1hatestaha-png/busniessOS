import "server-only";

import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z, ZodError, type ZodType } from "zod";

import { canPerformAction, type Permission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";

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
    public readonly status: 401 | 403 | 404 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireApiUser() {
  const session = await auth();
  if (!session.userId) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  let localUser = await db.user.findUnique({ where: { clerkId: session.userId } });
  if (!localUser) {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress;
    if (!clerkUser || !email) throw new ApiError(403, "USER_NOT_PROVISIONED", "The authenticated user cannot be provisioned.");
    localUser = await db.user.upsert({ where: { clerkId: session.userId }, create: { clerkId: session.userId, email, firstName: clerkUser.firstName, lastName: clerkUser.lastName }, update: { email, firstName: clerkUser.firstName, lastName: clerkUser.lastName } });
  }

  return localUser;
}

export async function requireApiContext(permission?: Permission): Promise<ApiContext> {
  const localUser = await requireApiUser();
  const activeWorkspaceId = (await cookies()).get("businessos_workspace")?.value;
  const user = await db.user.findUnique({
    where: { id: localUser.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      memberships: {
        where: activeWorkspaceId ? { workspaceId: activeWorkspaceId } : undefined,
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          workspaceId: true,
          role: true,
          workspace: true,
        },
      },
    },
  });

  if (!user) throw new ApiError(403, "USER_NOT_PROVISIONED", "The authenticated user is not provisioned.");

  const membership = user.memberships[0];
  if (!membership) {
    throw new ApiError(403, "WORKSPACE_REQUIRED", "A workspace membership is required.");
  }
  if (permission && !canPerformAction(membership.role, permission)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
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
        { status: 422 },
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
