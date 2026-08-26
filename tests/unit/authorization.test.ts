import type { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireWorkspaceMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: requireWorkspaceMock }));

import { canPerformAction, ForbiddenError, requirePermission, type Permission } from "@/lib/server/authorization";

const allPermissions: Permission[] = [
  "business.read",
  "customers.write",
  "products.write",
  "inventory.adjust",
  "sales.create",
  "payments.record",
  "financial.manage",
  "workspace.manage",
  "members.manage",
];

const authorizationMatrix: Record<Role, Permission[]> = {
  OWNER: allPermissions,
  ADMIN: allPermissions.filter((permission) => permission !== "members.manage"),
  MANAGER: allPermissions.filter((permission) => !["workspace.manage", "members.manage"].includes(permission)),
  STAFF: ["business.read", "sales.create"],
};

describe("authorization matrix", () => {
  beforeEach(() => requireWorkspaceMock.mockReset());
  it.each(Object.entries(authorizationMatrix) as [Role, Permission[]][])(
    "grants exactly the configured permissions to %s",
    (role, allowedPermissions) => {
      for (const permission of allPermissions) {
        expect(canPerformAction(role, permission), `${role}: ${permission}`).toBe(
          allowedPermissions.includes(permission),
        );
      }
    },
  );

  it("allows a manager to create sales", async () => {
    requireWorkspaceMock.mockResolvedValue({ role: "MANAGER", workspaceId: "workspace" });
    await expect(requirePermission("sales.create")).resolves.toMatchObject({ role: "MANAGER" });
  });

  it("allows staff to create sales but blocks workspace management", async () => {
    requireWorkspaceMock.mockResolvedValue({ role: "STAFF", workspaceId: "workspace" });
    await expect(requirePermission("sales.create")).resolves.toBeTruthy();
    await expect(requirePermission("workspace.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
