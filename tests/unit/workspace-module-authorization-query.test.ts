import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: query } }));
import { requireWorkspaceModule } from "@/lib/server/industry-modules";
describe("fresh tenant module authorization projection", () => {
  beforeEach(() => vi.clearAllMocks());
  it("checks the workspace and module with one scoped read", async () => {
    query.mockResolvedValue([{ vertical: "RESTAURANT", enabled: true }]);
    await requireWorkspaceModule("owned-workspace", "restaurant");
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    const sql = Prisma.sql(call[0], ...call.slice(1));
    expect(sql.text).toContain('m."workspaceId"=w."id"::uuid');
    expect(sql.values).toEqual(["restaurant", "owned-workspace"]);
  });
  it.each([false, null])("rejects a disabled or absent module %s", async enabled => {
    query.mockResolvedValue([{ vertical: "RESTAURANT", enabled }]);
    await expect(requireWorkspaceModule("owned-workspace", "restaurant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });
  it("rejects a nonexistent workspace", async () => {
    query.mockResolvedValue([]);
    await expect(requireWorkspaceModule("foreign-or-missing", "restaurant")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects an unavailable vertical despite an enabled module", async () => {
    query.mockResolvedValue([{ vertical: "PROPERTY", enabled: true }]);
    await expect(requireWorkspaceModule("owned-workspace", "restaurant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });
  it("rechecks after a module change rather than retaining authorization", async () => {
    query.mockResolvedValueOnce([{ vertical: "RESTAURANT", enabled: true }]).mockResolvedValueOnce([{ vertical: "RESTAURANT", enabled: false }]);
    await requireWorkspaceModule("owned-workspace", "restaurant");
    await expect(requireWorkspaceModule("owned-workspace", "restaurant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
