import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/server/db";
import {
  assertRestaurantStation,
  getRestaurantActorStation,
  listRestaurantStationStaff,
  setRestaurantStaffStation,
} from "@/lib/server/restaurant-stations";

const run = randomUUID();
let ownerId: string;
let staffId: string;
let workspaceA: string;
let workspaceB: string;
const workspaces: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const owner = await db.user.create({
    data: { clerkId: `restaurant-stations-owner-${run}`, email: `station-owner-${run}@example.invalid` },
  });
  ownerId = owner.id;
  users.push(owner.id);
  const staff = await db.user.create({
    data: { clerkId: `restaurant-stations-staff-${run}`, email: `station-staff-${run}@example.invalid` },
  });
  staffId = staff.id;
  users.push(staff.id);
  const a = await db.workspace.create({
    data: {
      name: `Restaurant station A ${run}`,
      members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
    },
  });
  workspaceA = a.id;
  workspaces.push(a.id);
  const b = await db.workspace.create({
    data: {
      name: `Restaurant station B ${run}`,
      members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
    },
  });
  workspaceB = b.id;
  workspaces.push(b.id);
});

afterAll(async () => {
  if (workspaces.length) {
    await db.$executeRaw`DELETE FROM "restaurant_staff_stations" WHERE "workspaceId" IN (${workspaceA}, ${workspaceB})`;
    await db.auditLog.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  }
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("Restaurant isolated STAFF station permissions (real PostgreSQL)", () => {
  it("denies unassigned STAFF both cashier and kitchen", async () => {
    expect(await getRestaurantActorStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId })).toBeNull();
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "CASHIER"))
      .rejects.toThrow(/not assigned/);
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "KITCHEN"))
      .rejects.toThrow(/not assigned/);
  });

  it("only a manager may assign staff; it never grants another tenant", async () => {
    const owner = { workspaceId: workspaceA, role: "OWNER", userId: ownerId };
    await expect(setRestaurantStaffStation({ ...owner, role: "STAFF" }, staffId, "KITCHEN")).rejects.toThrow();
    await setRestaurantStaffStation(owner, staffId, "KITCHEN");
    expect(await getRestaurantActorStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId })).toBe("KITCHEN");
    expect(await getRestaurantActorStation({ workspaceId: workspaceB, role: "STAFF", userId: staffId })).toBeNull();
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "KITCHEN"))
      .resolves.toBeUndefined();
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "CASHIER"))
      .rejects.toThrow(/not assigned/);
    const staff = await listRestaurantStationStaff(workspaceA);
    expect(staff).toMatchObject([{ userId: staffId, station: "KITCHEN" }]);
    const audit = await db.auditLog.findFirst({ where: { workspaceId: workspaceA, action: "restaurant.staff.station_assigned" } });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ station: "KITCHEN" });
  });

  it("switches from kitchen to cashier and can revoke immediately", async () => {
    const actor = { workspaceId: workspaceA, role: "OWNER", userId: ownerId };
    await setRestaurantStaffStation(actor, staffId, "CASHIER");
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "CASHIER"))
      .resolves.toBeUndefined();
    await expect(assertRestaurantStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId }, "KITCHEN"))
      .rejects.toThrow();
    await setRestaurantStaffStation(actor, staffId, null);
    expect(await getRestaurantActorStation({ workspaceId: workspaceA, role: "STAFF", userId: staffId })).toBeNull();
  });

  it("cannot assign an owner or outsider as a STAFF station", async () => {
    const actor = { workspaceId: workspaceA, role: "OWNER", userId: ownerId };
    await expect(setRestaurantStaffStation(actor, ownerId, "CASHIER")).rejects.toThrow(/Only current STAFF/);
    await expect(setRestaurantStaffStation(actor, "nonexistent-user", "KITCHEN")).rejects.toThrow(/Only current STAFF/);
  });
});
