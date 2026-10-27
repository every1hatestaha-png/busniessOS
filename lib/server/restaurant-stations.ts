import "server-only";

import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule } from "@/lib/server/industry-modules";
import {
  canUseRestaurantStation,
  isRestaurantManager,
  type RestaurantStation,
  type RestaurantStationOperation,
} from "@/lib/restaurant/station-policy";

export type RestaurantActor = {
  workspaceId: string;
  role: string;
  userId: string;
};

/**
 * Membership is established by requireWorkspace(); the assignment is always
 * looked up by both the authenticated user and their current tenant.
 */
export async function getRestaurantActorStation(actor: RestaurantActor): Promise<RestaurantStation | null> {
  if (isRestaurantManager(actor.role)) return null;
  if (actor.role !== "STAFF") return null;
  const rows = await db.$queryRaw<Array<{ station: RestaurantStation }>>`
    SELECT rss."station"
    FROM "restaurant_staff_stations" rss
    INNER JOIN "workspace_members" wm
      ON wm."workspaceId"=rss."workspaceId" AND wm."userId"=rss."userId"
    WHERE rss."workspaceId"=${actor.workspaceId}
      AND rss."userId"=${actor.userId}
      AND wm."role"='STAFF'
    LIMIT 1
  `;
  return rows[0]?.station ?? null;
}

export async function assertRestaurantStation(actor: RestaurantActor, operation: RestaurantStationOperation) {
  const station = await getRestaurantActorStation(actor);
  if (!canUseRestaurantStation(actor.role, station, operation)) {
    throw new IndustryDomainError("PERMISSION_DENIED",
      operation === "MANAGER" ? "Manager permission is required." :
      `Your restaurant staff account is not assigned to the ${operation.toLowerCase()} station.`);
  }
}

/** Manager's staff list (no financial records or password data). */
export async function listRestaurantStationStaff(workspaceId: string) {
  return db.$queryRaw<Array<{ userId: string; email: string; station: RestaurantStation | null }>>`
    SELECT wm."userId", u."email", rss."station"
    FROM "workspace_members" wm
    INNER JOIN "users" u ON u."id"=wm."userId"
    LEFT JOIN "restaurant_staff_stations" rss
      ON rss."workspaceId"=wm."workspaceId" AND rss."userId"=wm."userId"
    WHERE wm."workspaceId"=${workspaceId} AND wm."role"='STAFF'
    ORDER BY u."email" ASC
  `;
}

/** Only already-invited STAFF members may be assigned; managers/owners excluded. */
export async function setRestaurantStaffStation(
  actor: RestaurantActor, staffUserId: string, station: RestaurantStation | null,
) {
  await assertRestaurantStation(actor, "MANAGER");
  // Server actions must still reject assignments if the restaurant module
  // was disabled after the staff management page was initially opened.
  await requireWorkspaceModule(actor.workspaceId, "restaurant");
  if (!staffUserId || staffUserId.length > 150) {
    throw new IndustryDomainError("INVALID_STATE", "Invalid staff user.");
  }
  if (station !== null && station !== "CASHIER" && station !== "KITCHEN") {
    throw new IndustryDomainError("INVALID_STATE", "Choose Cashier, Kitchen or No access.");
  }
  return db.$transaction(async (tx) => {
    const members = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT "userId" FROM "workspace_members"
      WHERE "workspaceId"=${actor.workspaceId} AND "userId"=${staffUserId}
        AND "role"='STAFF'
      FOR UPDATE
    `;
    if (!members[0]) throw new IndustryDomainError("PERMISSION_DENIED", "Only current STAFF members can receive station access.");
    if (station === null) {
      await tx.$executeRaw`DELETE FROM "restaurant_staff_stations"
        WHERE "workspaceId"=${actor.workspaceId} AND "userId"=${staffUserId}`;
    } else {
      await tx.$executeRaw`
        INSERT INTO "restaurant_staff_stations" ("workspaceId","userId","station","assignedByUserId")
        VALUES (${actor.workspaceId},${staffUserId},${station},${actor.userId})
        ON CONFLICT ("workspaceId","userId") DO UPDATE
        SET "station"=EXCLUDED."station", "assignedByUserId"=EXCLUDED."assignedByUserId",
          "updatedAt"=CURRENT_TIMESTAMP
      `;
    }
    // This audit shares the staff mutation transaction, so a rejected change
    // leaves neither a permission nor an unaudited change.
    await tx.auditLog.create({
      data: {
        workspaceId: actor.workspaceId, actorId: actor.userId,
        action: "restaurant.staff.station_assigned",
        entityType: "WorkspaceMember", entityId: staffUserId,
        metadata: { station: station ?? "NONE" },
      },
    });
  });
}
