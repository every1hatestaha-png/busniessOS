import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashierMissingPaymentAccount } from "@/components/restaurant/cashier-missing-payment-account";
import { formatRestaurantOrderTime } from "@/lib/restaurant/timezone-format";

describe("Cashier account setup and restaurant timezone", () => {
  it("tells staff to contact a Manager, never links forbidden accounting", () => {
    const html = renderToStaticMarkup(<CashierMissingPaymentAccount canConfigure={false} />);
    expect(html).toContain("Ask your Manager");
    expect(html).toContain("Payment collection unavailable");
    expect(html).not.toContain("/accounting/cash-bank");
  });

  it("offers accounting setup only to authorized managers", () => {
    const html = renderToStaticMarkup(<CashierMissingPaymentAccount canConfigure />);
    expect(html).toContain("Open Cash &amp; Bank setup");
    expect(html).toContain('href="/accounting/cash-bank"');
  });

  it("formats in the restaurant workspace timezone with safe legacy fallback", () => {
    const date = new Date("2026-11-01T12:00:00Z");
    const ny = formatRestaurantOrderTime(date, "America/New_York");
    const pk = formatRestaurantOrderTime(date, "Asia/Karachi");
    expect(ny).not.toEqual(pk);
    expect(formatRestaurantOrderTime(date, "Not/A_Timezone")).toEqual(pk);
    expect(formatRestaurantOrderTime(date)).toEqual(pk);
  });
});
