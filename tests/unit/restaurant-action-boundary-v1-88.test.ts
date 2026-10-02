import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transition: vi.fn(), reverse: vi.fn(), auth: vi.fn(), confirm: vi.fn(), availability: vi.fn(), payment: vi.fn(), void: vi.fn(), prepare: vi.fn(), itemReturn: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/restaurant-integrity", () => ({ transitionRestaurantOrderWithIntegrity: mocks.transition, voidRestaurantPayment: mocks.void }));
vi.mock("@/lib/server/restaurant-return-reversals", () => ({ reverseRestaurantItemReturn: mocks.reverse }));

vi.mock("@/lib/server/restaurant-workspace", () => ({ confirmRestaurantOrder: mocks.confirm, setRestaurantMenuItemAvailability: mocks.availability }));
vi.mock("@/lib/server/restaurant-payments-immediate", () => ({ recordRestaurantPaymentAtCollection: mocks.payment }));
vi.mock("@/lib/server/restaurant-return-ui", () => ({ prepareRestaurantSingleItemReturn: mocks.prepare }));
vi.mock("@/lib/server/restaurant-item-returns", () => ({ createRestaurantItemReturn: mocks.itemReturn }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ workspaceId: "workspace-a", role: "OWNER", user: { id: "user-a" } });
});

describe("Restaurant V1.88 expected action failures", () => {
  it("returns controlled feedback for a database trigger rejection", async () => {
    mocks.transition.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("SQL constraint private_workspace secret", { code: "P2010", clientVersion: "7.10.0", meta: { code: "P0001" } }));
    const { transitionRestaurantOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    const form = new FormData();
    form.set("orderId", "invalid-order");
    form.set("nextStatus", "COMPLETED");
    const result = await transitionRestaurantOrderAction(form);
    expect(result).toEqual({ status: "error", message: "We could not update this order. Refresh its status before trying again." });
  });
  it("returns controlled feedback after return reversal retry exhaustion", async () => {
    mocks.reverse.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("deadlock private_table SQL", { code: "P2034", clientVersion: "7.10.0" }));
    const { reverseRestaurantReturnAction } = await import("@/app/(dashboard)/restaurant/orders/[id]/return/reversal-actions");
    expect(await reverseRestaurantReturnAction(new FormData())).toEqual({ status: "error", message: "We could not reverse this return. Refresh its status before trying again." });
  });
});


describe("Restaurant V1.88 action coverage and exceptions", () => {
  it.each([
    ["confirmRestaurantOrderAction", "confirm"],
    ["setMenuItemAvailabilityAction", "availability"],
    ["recordRestaurantPaymentAction", "payment"],
    ["voidRestaurantPaymentAction", "void"],
    ["createRestaurantItemReturnAction", "prepare"],
  ] as const)("%s redacts known database errors", async (name, mock) => {
    mocks[mock].mockRejectedValue(new Prisma.PrismaClientKnownRequestError("SQL internal secret", { code: "P2010", clientVersion: "7.10.0" }));
    const actions = await import("@/app/(dashboard)/restaurant/v1-actions");
    const result = await actions[name](new FormData());
    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/SQL|internal|secret|Prisma/i);
  });
  it("rejects a stale form after workspace switch before mutation", async () => {
    const { recordRestaurantPaymentAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    const form = new FormData(); form.set("formWorkspaceId", "workspace-b");
    expect(await recordRestaurantPaymentAction(form)).toEqual({ status: "error", message: "Your workspace changed. Refresh this page before submitting." });
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it("preserves auth redirect on session expiry", async () => {
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT" });
    mocks.auth.mockRejectedValue(redirect);
    const { voidRestaurantPaymentAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    await expect(voidRestaurantPaymentAction(new FormData())).rejects.toBe(redirect);
    expect(mocks.void).not.toHaveBeenCalled();
  });
  it("does not swallow unexpected programmer errors", async () => {
    const bug = new TypeError("programmer error"); mocks.void.mockRejectedValue(bug);
    const { voidRestaurantPaymentAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    await expect(voidRestaurantPaymentAction(new FormData())).rejects.toBe(bug);
  });
  it("returns invalid status feedback without a mutation", async () => {
    const { transitionRestaurantOrderAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    expect((await transitionRestaurantOrderAction(new FormData())).status).toBe("error");
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
