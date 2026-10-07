import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: query } }));
import { getRestaurantOverviewReadiness } from "@/lib/server/industry-modules";

describe("Restaurant overview summary", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns counts and the active shift without loading recipe ingredients or shift history", async () => {
    query.mockResolvedValueOnce([{ vertical: "RESTAURANT", enabled: true }]).mockResolvedValueOnce([
      { recipes: 12, activeRecipes: 8, openKitchenTickets: 4, openShiftId: "open-shift", openingCash: new Prisma.Decimal(125.5) },
    ]);
    expect(await getRestaurantOverviewReadiness("workspace-a")).toEqual({ recipes: 12, activeRecipes: 8, openKitchenTickets: 4, openShift: { id: "open-shift", openingCash: 125.5 } });
    expect(query).toHaveBeenCalledTimes(2);
    const call = query.mock.calls[1];
    const sql = Prisma.sql(call[0], ...call.slice(1));
    expect(sql.values).toEqual(["workspace-a", "workspace-a", "workspace-a", "workspace-a"]);
    expect(sql.text).toContain('"status"=\'OPEN\'');
    expect(sql.text).toContain('LIMIT 1');
    expect(sql.text).not.toContain("recipe_ingredients");
  });
  it("returns a closed shift and zero counts for an empty tenant", async () => {
    query.mockResolvedValueOnce([{ vertical: "RESTAURANT", enabled: true }]).mockResolvedValueOnce([
      { recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShiftId: null, openingCash: null },
    ]);
    expect(await getRestaurantOverviewReadiness("empty-tenant")).toEqual({ recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShift: null });
  });
  it("does not query summaries for a missing or disabled module", async () => {
    query.mockResolvedValue([{ vertical: "RESTAURANT", enabled: false }]);
    await expect(getRestaurantOverviewReadiness("disabled-tenant")).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
