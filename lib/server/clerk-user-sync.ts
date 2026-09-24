import "server-only";

import { db } from "@/lib/server/db";

export type ClerkLifecycleIdentity = {
  id: string;
  email: string | null;
  verifiedPrimaryEmail: string | null;
  firstName: string | null;
  lastName: string | null;
};

export class ClerkUserSyncConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClerkUserSyncConflictError";
  }
}

export async function syncClerkLifecycleIdentity(
  eventType: "user.created" | "user.updated" | "user.deleted",
  identity: ClerkLifecycleIdentity,
) {
  if (eventType === "user.deleted") {
    const localUser = await db.user.findUnique({
      where: { clerkId: identity.id },
      select: {
        id: true,
        memberships: { select: { role: true } },
      },
    });
    if (!localUser) return { synced: false as const, reason: "not_found" as const };

    if (localUser.memberships.some((membership) => membership.role === "OWNER")) {
      return { synced: false as const, reason: "owner_preserved" as const };
    }

    await db.user.delete({ where: { id: localUser.id } });
    return { synced: true as const, action: "deleted" as const };
  }

  const verifiedEmail = identity.verifiedPrimaryEmail?.trim().toLowerCase() ?? null;
  if (!verifiedEmail) {
    return { synced: false as const, reason: "verified_email_required" as const };
  }

  return db.$transaction(async (tx) => {
    const byClerkId = await tx.user.findUnique({ where: { clerkId: identity.id } });
    const byEmail = await tx.user.findUnique({ where: { email: verifiedEmail } });

    if (byClerkId && byEmail && byClerkId.id !== byEmail.id) {
      throw new ClerkUserSyncConflictError(
        "Verified Clerk email is already linked to a different MunshiOS user.",
      );
    }

    if (byClerkId) {
      const updated = await tx.user.update({
        where: { id: byClerkId.id },
        data: {
          email: verifiedEmail,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
      });
      return { synced: true as const, action: "updated" as const, user: updated };
    }

    if (byEmail) {
      const recovered = await tx.user.update({
        where: { id: byEmail.id },
        data: {
          clerkId: identity.id,
          email: verifiedEmail,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
      });
      return { synced: true as const, action: "relinked" as const, user: recovered };
    }

    const created = await tx.user.create({
      data: {
        clerkId: identity.id,
        email: verifiedEmail,
        firstName: identity.firstName,
        lastName: identity.lastName,
      },
    });
    return { synced: true as const, action: "created" as const, user: created };
  });
}
