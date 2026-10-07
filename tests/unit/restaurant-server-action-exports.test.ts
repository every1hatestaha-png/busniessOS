import { describe, expect, it, vi } from "vitest";
import { ensureServerEntryExports } from "next/dist/build/webpack/loaders/next-flight-loader/action-validate";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/restaurant-mutation-access", () => ({ assertRestaurantMutationAccess: vi.fn() }));
vi.mock("@/lib/server/restaurant-cash-shifts", () => ({ openRestaurantCashShiftSafely: vi.fn(), closeRestaurantCashShiftFromLedger: vi.fn() }));
vi.mock("@/lib/server/restaurant-legacy-kot", () => ({ updateLegacyKitchenTicketStatusSafely: vi.fn() }));
vi.mock("@/lib/server/industry-modules", () => ({ createKitchenTicket: vi.fn(), createRecipe: vi.fn(), createRestaurantTable: vi.fn() }));
import * as actions from "@/app/(dashboard)/restaurant/actions";
import { initialRestaurantActionState } from "@/app/(dashboard)/restaurant/action-state";
describe("Restaurant server-action export boundary", () => {
 it("passes the installed Next.js runtime validation for every action export", () => {
  expect(Object.keys(actions)).toHaveLength(6);
  expect(() => ensureServerEntryExports(Object.values(actions))).not.toThrow();
  for (const action of Object.values(actions)) expect(action.constructor.name).toBe("AsyncFunction");
 });
 it("reproduces the runtime failure if shared form state is exported as an action", () => {
  expect(() => ensureServerEntryExports([...Object.values(actions), initialRestaurantActionState])).toThrow('found object');
 });
});
