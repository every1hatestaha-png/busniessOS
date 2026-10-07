import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(), $executeRaw: vi.fn(),
    workspaceMember: { findFirst: vi.fn(), create: vi.fn() },
    workspace: { create: vi.fn() }, user: { update: vi.fn() },
  };
  return { tx, audit: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/server/tx-retry", () => ({ withSerializableRetry: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx) }));
vi.mock("@/lib/server/audit", () => ({ writeAudit: mocks.audit }));
import { createInitialWorkspace } from "@/lib/server/onboarding";
import { resolveProvisioningModules } from "@/lib/saas/provisioning-selection";

const input = { businessName: "Synthetic Restaurant", ownerName: "Synthetic Owner", phone: "03001234567", email: "synthetic@example.invalid", address: "Synthetic Street", city: "Lahore", country: "Pakistan", currency: "PKR" as const, timezone: "Asia/Karachi", businessType: "OTHER" as const };
const workspaceId = "7e327471-a3e9-4dd8-9f60-2edb3728aef6";
const moduleWrites = () => mocks.tx.$executeRaw.mock.calls.filter(c => c[0].join("").includes('INSERT INTO "workspace_modules"'));

describe("Restaurant provisioning transaction contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tx.workspace.create.mockResolvedValue({ id: workspaceId, vertical: "RESTAURANT" });
    mocks.tx.workspaceMember.findFirst.mockResolvedValue(null);
    mocks.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("");
      if (sql.includes("FOR UPDATE")) return [{ id: values[0] }];
      if (sql.includes('SELECT "id" FROM "workspace_subscriptions"')) return [{ id: "subscription" }];
      return [];
    });
  });
  it.each([[], ["restaurant"], ["accounting"]].map(modules => [modules]))("enforces Restaurant + Inventory for a Restaurant selection %j", async modules => {
    await createInitialWorkspace("owner-id", input, { builderBusiness: "restaurant", billing: "monthly", modules: modules as ("restaurant" | "accounting")[] }, { provisioningRequestId: "test:restaurant" });
    expect(mocks.tx.workspace.create.mock.calls[0][0].data.vertical).toBe("RESTAURANT");
    expect(mocks.tx.workspaceMember.create).toHaveBeenCalledWith({ data: { workspaceId, userId: "owner-id", role: "OWNER" } });
    expect(moduleWrites().filter(c => c[3]).map(c => c[2])).toEqual(expect.arrayContaining(["inventory", "restaurant"]));
    expect(mocks.tx.$executeRaw.mock.calls.some(c => c[0].join("").includes("'TRIALING'"))).toBe(true);
    expect(mocks.audit.mock.calls[0][1]).toMatchObject({ workspaceId, actorId: "owner-id", action: "workspace.provisioned", metadata: { vertical: "RESTAURANT" } });
  });
  it("keeps the generic/trading default free of Restaurant selection", async () => {
    mocks.tx.workspace.create.mockResolvedValue({ id: workspaceId, vertical: "TRADING" });
    await createInitialWorkspace("owner-id", { ...input, businessType: "WHOLESALER" }, undefined, { provisioningRequestId: "test:trading" });
    expect(mocks.tx.workspace.create.mock.calls[0][0].data.vertical).toBe("TRADING");
    expect(moduleWrites().find(c => c[2] === "restaurant")?.[3]).toBe(false);
  });
  it("does not rewrite modules or subscriptions through an existing membership", async () => {
    mocks.tx.workspaceMember.findFirst.mockResolvedValue({ workspaceId: "another-owner-workspace" });
    await expect(createInitialWorkspace("member-id", input, { builderBusiness: "restaurant", billing: "monthly", modules: ["restaurant"] }, { provisioningRequestId: "test:member-request" })).resolves.toEqual({ workspaceId: "another-owner-workspace" });
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.workspace.create).not.toHaveBeenCalled();
  });
  it("scopes membership lookup and workspace ownership to the authenticated user", async () => {
    await createInitialWorkspace("different-owner-id", input, undefined, { provisioningRequestId: "test:other-user" });
    expect(mocks.tx.workspaceMember.findFirst).toHaveBeenCalledWith({ where: { userId: "different-owner-id" }, select: { workspaceId: true } });
    expect(mocks.tx.workspaceMember.create.mock.calls[0][0].data.userId).toBe("different-owner-id");
  });
  it("enforces modules in the canonical selection helper too", () => {
    expect(resolveProvisioningModules([], "restaurant")).toEqual(["inventory", "restaurant"]);
  });
});
