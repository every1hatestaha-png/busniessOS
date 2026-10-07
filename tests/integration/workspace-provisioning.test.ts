import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { PROVISIONING_MODULE_KEYS } from "@/lib/saas/provisioning-selection";
import { db } from "@/lib/server/db";
import { createInitialWorkspace } from "@/lib/server/onboarding";
import { getRestaurantOverviewReadiness } from "@/lib/server/industry-modules";
import type { OnboardingInput } from "@/lib/validation/onboarding";

const runId = randomUUID();
const userIds: string[] = [];
const workspaceIds: string[] = [];

const input: OnboardingInput = {
  businessName: `Provisioning Test ${runId}`,
  ownerName: "Synthetic Owner",
  phone: "03001234567",
  email: `provisioning-${runId}@example.invalid`,
  address: "Synthetic Street 1",
  city: "Lahore",
  country: "Pakistan",
  currency: "PKR",
  timezone: "Asia/Karachi",
  businessType: "WHOLESALER",
};

describe("workspace provisioning transaction", () => {
  it("provisions a new isolated Restaurant workspace with both modules and a trial", async () => {
    const user = await db.user.create({ data: { clerkId: `restaurant-provisioning-${runId}`, email: `restaurant-provisioning-${runId}@example.invalid` } });
    userIds.push(user.id);
    const result = await createInitialWorkspace(user.id, { ...input, businessType: "OTHER" }, { modules: [], builderBusiness: "restaurant", billing: "monthly" }, { provisioningRequestId: `test:restaurant:${runId}` });
    workspaceIds.push(result.workspaceId);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: result.workspaceId } })).vertical).toBe("RESTAURANT");
    expect(await db.workspaceMember.count({ where: { userId: user.id, workspaceId: result.workspaceId, role: "OWNER" } })).toBe(1);
    const modules = await db.$queryRaw<Array<{ moduleKey: string }>>`SELECT "moduleKey" FROM workspace_modules WHERE "workspaceId"=${result.workspaceId}::uuid AND enabled=true ORDER BY "moduleKey"`;
    expect(modules.map(m => m.moduleKey)).toEqual(["inventory", "restaurant"]);
    const subscription = await db.$queryRaw<Array<{ status: string; trialEndsAt: Date }>>`SELECT status, "trialEndsAt" FROM workspace_subscriptions WHERE "workspaceId"=${result.workspaceId}`;
    expect(subscription[0]?.status).toBe("TRIALING");
    expect(subscription[0]?.trialEndsAt.getTime()).toBeGreaterThan(Date.now());
    expect(await db.workspaceMember.count({ where: { workspaceId: result.workspaceId, userId: { not: user.id } } })).toBe(0);
    expect(await getRestaurantOverviewReadiness(result.workspaceId)).toEqual({ recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShift: null });
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it("commits workspace, membership, subscription, modules and audit once for the same request", async () => {
    const user = await db.user.create({
      data: { clerkId: `provisioning-${runId}`, email: `provisioning-user-${runId}@example.invalid` },
    });
    userIds.push(user.id);

    const requestId = `test:${randomUUID()}`;
    const first = await createInitialWorkspace(user.id, input, undefined, {
      allowAdditional: true,
      provisioningRequestId: requestId,
    });
    workspaceIds.push(first.workspaceId);

    const repeated = await createInitialWorkspace(user.id, input, undefined, {
      allowAdditional: true,
      provisioningRequestId: requestId,
    });

    expect(repeated.workspaceId).toBe(first.workspaceId);

    const [workspace, membershipCount, subscriptions, modules, audits] = await Promise.all([
      db.workspace.findUniqueOrThrow({ where: { id: first.workspaceId } }),
      db.workspaceMember.count({ where: { workspaceId: first.workspaceId, userId: user.id, role: "OWNER" } }),
      db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS "count" FROM "workspace_subscriptions" WHERE "workspaceId" = ${first.workspaceId}`,
      db.$queryRaw<Array<{ moduleKey: string; enabled: boolean }>>`SELECT "moduleKey", "enabled" FROM "workspace_modules" WHERE "workspaceId" = ${first.workspaceId}::uuid ORDER BY "moduleKey"`,
      db.auditLog.findMany({ where: { workspaceId: first.workspaceId, action: "workspace.provisioned" } }),
    ]);

    expect(workspace.vertical).toBe("TRADING");
    expect(membershipCount).toBe(1);
    expect(subscriptions[0]?.count).toBe(1);
    expect(modules).toHaveLength(PROVISIONING_MODULE_KEYS.length);
    expect(modules.filter((module) => module.enabled).map((module) => module.moduleKey).sort()).toEqual(["accounting", "inventory", "wholesale"]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ provisioningRequestId: requestId, vertical: "TRADING" });
  });

  it("allows a later explicitly distinct request to create another workspace", async () => {
    const user = await db.user.create({
      data: { clerkId: `provisioning-second-${runId}`, email: `provisioning-second-${runId}@example.invalid` },
    });
    userIds.push(user.id);

    const first = await createInitialWorkspace(user.id, input, undefined, {
      allowAdditional: true,
      provisioningRequestId: `test:first:${runId}`,
    });
    const second = await createInitialWorkspace(user.id, { ...input, businessName: `${input.businessName} 2` }, undefined, {
      allowAdditional: true,
      provisioningRequestId: `test:second:${runId}`,
    });
    workspaceIds.push(first.workspaceId, second.workspaceId);

    expect(second.workspaceId).not.toBe(first.workspaceId);
    expect(await db.workspaceMember.count({ where: { userId: user.id, role: "OWNER" } })).toBe(2);
  });
});
