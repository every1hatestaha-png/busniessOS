import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const session = vi.hoisted(() => ({ userId: "", activeId: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => session.activeId ? { value: session.activeId } : undefined,
  set: (_key: string, value: string) => { session.activeId = value; },
}) }));
vi.mock("@/lib/server/auth", () => ({
  getOptionalCurrentUser: async () => ({ id: session.userId, email: "synthetic@example.invalid", firstName: null, lastName: null }),
  requireWorkspace: async () => {
    const { db } = await import("@/lib/server/db");
    const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: session.activeId, userId: session.userId } }, include: { workspace: true } });
    if (!member || ["RESTAURANT", "PROPERTY", "SERVICES"].includes(member.workspace.vertical)) throw new Error("WORKSPACE_UNAVAILABLE");
    return { workspaceId: member.workspaceId, role: member.role, vertical: member.workspace.vertical, user: { id: session.userId } };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/server/subscriptions", () => ({ getWorkspaceAccess: async () => ({ allowed: true }) }));

import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { requireApiContext } from "@/lib/server/api";
import { POST as switchWorkspace } from "@/app/api/v1/workspace/switch/route";
import { GET as listCustomers, POST as createCustomer } from "@/app/api/v1/customers/route";
import { GET as getCustomer } from "@/app/api/v1/customers/[id]/route";
import { GET as search } from "@/app/api/search/route";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";
import { createRestaurantTableAction } from "@/app/(dashboard)/restaurant/actions";

const runId = randomUUID();
const workspaces: Record<string,string> = {};
const customers: Record<string,string> = {};
let memberUser = "";
let outsiderUser = "";

function listWithQuery(request: Request): Promise<Response> {
  return Reflect.apply(listCustomers, undefined, [request]) as Promise<Response>;
}

async function switchTo(workspaceId: string) {
  return switchWorkspace(new Request("http://localhost/api/v1/workspace/switch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }),
  }));
}

describe("vertical boundaries with isolated PostgreSQL", () => {
  beforeAll(async () => {
    memberUser = (await db.user.create({ data: { clerkId: `vertical-member-${runId}`, email: `vertical-member-${runId}@example.invalid` } })).id;
    outsiderUser = (await db.user.create({ data: { clerkId: `vertical-outsider-${runId}`, email: `vertical-outsider-${runId}@example.invalid` } })).id;
    for (const [name,vertical] of Object.entries({ trading: "TRADING", manufacturing: "MANUFACTURING", legacy: "LEGACY", restaurant: "RESTAURANT", property: "PROPERTY", services: "SERVICES" } as const)) {
      const ws = await db.workspace.create({ data: { name: `vertical-${name}-${runId}`, businessType: name === "legacy" ? "OTHER" : "WHOLESALER", vertical } });
      workspaces[name] = ws.id;
      await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: memberUser, role: name === "manufacturing" ? "STAFF" : "OWNER" } });
      const customer = await db.customer.create({ data: { workspaceId: ws.id, name: `unique-${name}-${runId}` } });
      customers[name] = customer.id;
      if (["trading", "manufacturing", "legacy"].includes(name)) {
        const modules = name === "legacy" ? ["restaurant", "services"] : name === "trading" ? ["manufacturing"] : ["manufacturing"];
        for (const module of modules) await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId","moduleKey",enabled) VALUES (${ws.id}::uuid, ${module}, true)`;
      }
    }
    session.userId = memberUser;
  });

  beforeEach(() => { session.userId = memberUser; session.activeId = workspaces.trading; });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: Object.values(workspaces) } } });
    await db.user.deleteMany({ where: { id: { in: [memberUser, outsiderUser] } } });
    await db.$disconnect();
  });

  it("switches across active verticals and picks the matching membership role", async () => {
    for (const name of ["manufacturing", "trading", "legacy", "manufacturing", "trading"] as const) {
      expect((await switchTo(workspaces[name])).status).toBe(200);
      const ctx = await requireApiContext("business.read");
      expect(ctx).toMatchObject({ workspaceId: workspaces[name], vertical: name.toUpperCase(), role: name === "manufacturing" ? "STAFF" : "OWNER" });
      const listing = await listWithQuery(new Request(`http://localhost/api/v1/customers?workspaceId=${workspaces.legacy}`));
      expect(listing.status).toBe(200);
      const body = JSON.stringify(await listing.json());
      expect(body).toContain(`unique-${name}-${runId}`);
      expect(body).not.toContain(`unique-${name === "trading" ? "legacy" : "trading"}-${runId}`);
    }
  });

  it("blocks outsider switching and foreign route params while ignoring body workspaceId", async () => {
    session.userId = outsiderUser;
    expect((await switchTo(workspaces.trading)).status).toBe(403);
    expect(session.activeId).toBe(workspaces.trading);
    session.userId = memberUser;
    const foreign = await getCustomer(new Request(`http://localhost/api/v1/customers/${customers.legacy}`), { params: Promise.resolve({ id: customers.legacy }) });
    expect(foreign.status).toBe(404);
    const created = await createCustomer(new Request("http://localhost/api/v1/customers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        workspaceId: workspaces.legacy, name: "Injected Customer", companyName: "Injected Company", phone: "03001234567",
        email: "injected@example.invalid", city: "Lahore", address: "Synthetic Street 1", creditLimit: "0", openingBalance: "0", status: "ACTIVE", notes: "",
      }),
    }));
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect((await db.customer.findUniqueOrThrow({ where: { id: data.id } })).workspaceId).toBe(workspaces.trading);
  });

  it("scopes global search and preserves LEGACY industry entitlements", async () => {
    const result = await search(new NextRequest(`http://localhost/api/search?q=unique&workspaceId=${workspaces.legacy}`));
    const text = JSON.stringify(await result.json());
    expect(text).toContain(`unique-trading-${runId}`);
    expect(text).not.toContain(`unique-legacy-${runId}`);
    await requireWorkspaceModule(workspaces.trading, "manufacturing");
    await requireWorkspaceModule(workspaces.legacy, "restaurant");
    await requireWorkspaceModule(workspaces.legacy, "services");
    await expect(requireWorkspaceModule(workspaces.manufacturing, "restaurant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await expect(requireWorkspaceModule(workspaces.property, "restaurant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });

  it("server actions ignore forged workspace IDs and enforce role and active membership", async () => {
    session.activeId = workspaces.legacy;
    const form = new FormData(); form.set("name", "Synthetic Table"); form.set("capacity", "2"); form.set("workspaceId", workspaces.trading);
    const response = await createRestaurantTableAction({ status: "idle", message: "" }, form);
    expect(response.status, JSON.stringify(response)).toBe("success");
    const rows = await db.$queryRaw<Array<{workspaceId:string}>>`SELECT "workspaceId"::text AS "workspaceId" FROM "restaurant_tables" WHERE name='Synthetic Table' AND "workspaceId"=${workspaces.legacy}::uuid`;
    expect(rows).toHaveLength(1);
    session.activeId = workspaces.manufacturing;
    expect((await createRestaurantTableAction({ status: "idle", message: "" }, form)).status).toBe("error");
  });

  it("denies unavailable vertical APIs but allows switching away", async () => {
    for (const name of ["restaurant", "property", "services"] as const) {
      expect((await switchTo(workspaces[name])).status).toBe(200);
      await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "VERTICAL_UNAVAILABLE" });
      expect((await listWithQuery(new Request("http://localhost/api/v1/customers"))).status).toBe(403);
      expect((await switchTo(workspaces.legacy)).status).toBe(200);
      expect((await requireApiContext("business.read")).vertical).toBe("LEGACY");
    }
    session.userId = outsiderUser;
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "WORKSPACE_REQUIRED" });
  });
});
