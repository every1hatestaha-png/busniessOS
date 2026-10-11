import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), transition: vi.fn(), void: vi.fn(), payment: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: m.auth }));
vi.mock("@/lib/server/restaurant-mutation-access", () => ({ assertRestaurantMutationAccess: m.access }));
vi.mock("@/lib/server/restaurant-integrity", () => ({ transitionRestaurantOrderWithIntegrity: m.transition, voidRestaurantPayment: m.void }));
vi.mock("@/lib/server/restaurant-payments-immediate", () => ({ recordRestaurantPaymentAtCollection: m.payment }));
import { transitionRestaurantOrderAction, voidRestaurantPaymentAction, recordRestaurantPaymentAction } from "@/app/(dashboard)/restaurant/v1-actions";
function actor(role: string, station = "ALL") {
  m.auth.mockResolvedValue({ workspaceId: "workspace-a", role, vertical: "RESTAURANT", restaurantStation: station, user: { id: "actor-a" } });
}
function form(nextStatus = "COMPLETED") {
  const data = new FormData();
  for (const [k,v] of Object.entries({ formWorkspaceId: "workspace-a", orderId: "order-a", paymentId: "payment-a", reason: "Synthetic reversal", nextStatus })) data.set(k,v);
  return data;
}
describe("direct Restaurant financial server actions", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["ALL", "POS", "KITCHEN"])("denies STAFF completion and void for station %s", async station => {
    actor("STAFF", station);
    expect((await transitionRestaurantOrderAction(form())).status).toBe("error");
    expect((await voidRestaurantPaymentAction(form())).status).toBe("error");
    expect(m.transition).not.toHaveBeenCalled(); expect(m.void).not.toHaveBeenCalled(); expect(m.access).not.toHaveBeenCalled();
  });
  it("rechecks a role downgrade rather than accepting a stale manager tab", async () => {
    actor("MANAGER"); expect((await transitionRestaurantOrderAction(form())).status).toBe("success");
    actor("STAFF", "POS"); expect((await transitionRestaurantOrderAction(form())).status).toBe("error");
    expect(m.transition).toHaveBeenCalledTimes(1);
  });
  it.each(["OWNER", "ADMIN", "MANAGER"])("permits %s financial actions", async role => {
    actor(role); expect((await transitionRestaurantOrderAction(form())).status).toBe("success");
    expect((await voidRestaurantPaymentAction(form())).status).toBe("success");
  });
  it("preserves cashier collection and kitchen preparation", async () => {
    actor("STAFF", "POS"); expect((await recordRestaurantPaymentAction(form())).status).toBe("success");
    actor("STAFF", "KITCHEN"); expect((await transitionRestaurantOrderAction(form("READY"))).status).toBe("success");
    expect(m.payment).toHaveBeenCalledOnce(); expect(m.transition).toHaveBeenCalledOnce();
  });
  it("denies workspace switching and membership removal before mutations", async () => {
    actor("OWNER"); const f = form(); f.set("formWorkspaceId", "foreign");
    expect((await voidRestaurantPaymentAction(f)).status).toBe("error");
    m.auth.mockRejectedValue(new Error("membership removed"));
    await expect(transitionRestaurantOrderAction(form())).rejects.toThrow("membership removed");
    expect(m.void).not.toHaveBeenCalled(); expect(m.transition).not.toHaveBeenCalled();
  });
});
