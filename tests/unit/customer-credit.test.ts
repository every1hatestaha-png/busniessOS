import { describe, expect, it } from "vitest";

import { getCreditPresentation } from "@/lib/customer-credit";

describe("customer credit presentation", () => {
  it.each([0, -1, Number.NaN])("does not calculate utilization without a valid monetary limit (%s)", (limit) => {
    expect(getCreditPresentation(2_907_017.4, limit)).toEqual({ usagePercent: null, value: "No monetary limit", detail: "Monetary credit limit not configured" });
  });

  it("keeps real over-limit utilization without dividing by a fallback", () => {
    expect(getCreditPresentation(150_000, 100_000)).toEqual({ usagePercent: 150, value: "150%", detail: "Rs 50,000 over limit" });
  });

  it("does not show negative utilization for a customer advance", () => {
    expect(getCreditPresentation(-20_000, 100_000)).toEqual({ usagePercent: 0, value: "0%", detail: "Rs 100,000 available" });
  });
});
