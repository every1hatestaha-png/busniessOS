import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), category: vi.fn(), menu: vi.fn(), pos: vi.fn(), confirm: vi.fn(), transition: vi.fn(), availability: vi.fn(), payment: vi.fn(), void: vi.fn(), prepare: vi.fn(), itemReturn: vi.fn(), reverse: vi.fn(), table: vi.fn(), open: vi.fn(), close: vi.fn(), recipe: vi.fn(), ticket: vi.fn(), legacy: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/subscriptions", () => ({ getWorkspaceAccess: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/restaurant-workspace", () => ({ createRestaurantMenuCategory: mocks.category, createRestaurantMenuItem: mocks.menu, createPosRestaurantOrder: mocks.pos, confirmRestaurantOrder: mocks.confirm, setRestaurantMenuItemAvailability: mocks.availability }));
vi.mock("@/lib/server/restaurant-integrity", () => ({ transitionRestaurantOrderWithIntegrity: mocks.transition, voidRestaurantPayment: mocks.void }));
vi.mock("@/lib/server/restaurant-payments-immediate", () => ({ recordRestaurantPaymentAtCollection: mocks.payment }));
vi.mock("@/lib/server/restaurant-return-ui", () => ({ prepareRestaurantSingleItemReturn: mocks.prepare }));
vi.mock("@/lib/server/restaurant-item-returns", () => ({ createRestaurantItemReturn: mocks.itemReturn }));
vi.mock("@/lib/server/restaurant-return-reversals", () => ({ reverseRestaurantItemReturn: mocks.reverse }));
vi.mock("@/lib/server/restaurant-cash-shifts", () => ({ openRestaurantCashShiftSafely: mocks.open, closeRestaurantCashShiftFromLedger: mocks.close }));
vi.mock("@/lib/server/restaurant-legacy-kot", () => ({ updateLegacyKitchenTicketStatusSafely: mocks.legacy }));
vi.mock("@/lib/server/industry-modules", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/server/industry-modules")>(), createRestaurantTable: mocks.table, createRecipe: mocks.recipe, createKitchenTicket: mocks.ticket }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ workspaceId: "workspace-a", role: "OWNER", user: { id: "user-a" } });
  mocks.access.mockResolvedValue({ allowed: true, reason: "active" });
  for (const [key,mock] of Object.entries(mocks)) if (key !== "auth" && key !== "access") mock.mockResolvedValue(undefined);
  mocks.pos.mockResolvedValue({ orderNumber: "SYNTHETIC-1" }); mocks.close.mockResolvedValue({ expectedCash: 0, variance: 0 }); mocks.prepare.mockResolvedValue({ paymentAllocations: [] });
});
function form() {
  const f = new FormData(); const id = "10000000-0000-4000-8000-000000000001", item = "10000000-0000-4000-8000-000000000002";
  for (const [k,v] of Object.entries({ formWorkspaceId: "workspace-a", name: "Synthetic", capacity: "4", price: "100", categoryId: id, menuItemId: item, orderId: id, paymentId: id, shiftId: id, ticketId: id, returnId: id, orderItemId: item, returnQuantity: "1", finishedProductId: id, yieldQuantity: "1", ticketNumber: "SYNTHETIC", status: "READY", nextStatus: "PREPARING", reason: "Synthetic reason", orderRequestId: id, itemsJson: JSON.stringify([{ menuItemId: item, ingredientProductId: item, quantity: 1 }]) })) f.set(k,v);
  return f;
}
const v1 = () => import("@/app/(dashboard)/restaurant/v1-actions");
const legacy = () => import("@/app/(dashboard)/restaurant/actions");
const initial = { status: "idle" as const, message: "" };
const actions: Array<[string,(f: FormData) => Promise<{ status: string; message: string }>]> = [
  ["category",async f => (await v1()).createMenuCategoryAction(initial,f)], ["menu",async f => (await v1()).createMenuItemAction(initial,f)],
  ["POS",async f => (await v1()).createPosOrderAction(initial,f)], ["confirm",async f => (await v1()).confirmRestaurantOrderAction(f)],
  ["transition",async f => (await v1()).transitionRestaurantOrderAction(f)], ["availability",async f => (await v1()).setMenuItemAvailabilityAction(f)],
  ["payment",async f => (await v1()).recordRestaurantPaymentAction(f)], ["void",async f => (await v1()).voidRestaurantPaymentAction(f)],
  ["return",async f => (await v1()).createRestaurantItemReturnAction(f)], ["table",async f => (await legacy()).createRestaurantTableAction(initial,f)],
  ["shift open",async f => (await legacy()).openCashShiftAction(initial,f)], ["shift close",async f => (await legacy()).closeCashShiftAction(initial,f)],
  ["recipe",async f => (await legacy()).createRecipeAction(initial,f)], ["KOT",async f => (await legacy()).createKitchenTicketAction(initial,f)],
  ["legacy KOT transition",async f => (await legacy()).updateKitchenTicketStatusAction(initial,f)],
  ["return reversal",async f => (await import("@/app/(dashboard)/restaurant/orders/[id]/return/reversal-actions")).reverseRestaurantReturnAction(f)],
];
it.each(actions)("%s checks current access before every write", async (_name,action) => {
  for (const reason of ["suspended","expired"]) {
    mocks.access.mockResolvedValue({ allowed: false, reason });
    const result = await action(form()); expect(result.status).toBe("error"); expect(result.message).toMatch(new RegExp(reason));
    expect(result.message).not.toMatch(/Prisma|SQL|constraint|stack/i);
  }
  for (const [key,mock] of Object.entries(mocks)) if (key !== "auth" && key !== "access") expect(mock).not.toHaveBeenCalled();
});
it("rechecks access for a stale tab instead of retaining an earlier allowed decision", async () => {
  const action = (await v1()).createPosOrderAction;
  expect((await action(initial,form())).status).toBe("success");
  mocks.access.mockResolvedValue({ allowed: false, reason: "suspended" });
  expect((await action(initial,form())).status).toBe("error"); expect(mocks.pos).toHaveBeenCalledTimes(1); expect(mocks.access).toHaveBeenCalledTimes(2);
});
