import { describe, expect, it } from "vitest";

import { validateFbrHsUomCompatibility } from "@/lib/fbr/tax-mapping";

describe("FBR HS/UOM compatibility gate", () => {
  it("requires an explicitly confirmed workspace annexure", () => {
    expect(validateFbrHsUomCompatibility({
      configuredAnnexureId: null,
      annexureConfirmedAt: null,
      annexureConfirmedBy: null,
      lineAnnexureId: null,
      lineVerifiedAt: null,
    })).toEqual(expect.objectContaining({ ready: false, code: "FBR_HS_UOM_ANNEXURE_NOT_CONFIRMED" }));
  });

  it("requires the line to have been verified against that same annexure", () => {
    const base = {
      configuredAnnexureId: 3,
      annexureConfirmedAt: new Date("2026-09-19T00:00:00.000Z"),
      annexureConfirmedBy: "user_123",
    };
    expect(validateFbrHsUomCompatibility({ ...base, lineAnnexureId: null, lineVerifiedAt: null }))
      .toEqual(expect.objectContaining({ ready: false, code: "FBR_HS_UOM_UNVERIFIED" }));
    expect(validateFbrHsUomCompatibility({
      ...base,
      lineAnnexureId: 4,
      lineVerifiedAt: new Date("2026-09-19T01:00:00.000Z"),
    })).toEqual(expect.objectContaining({ ready: false, code: "FBR_HS_UOM_ANNEXURE_MISMATCH" }));
  });

  it("is ready only when confirmation and immutable line snapshot agree", () => {
    expect(validateFbrHsUomCompatibility({
      configuredAnnexureId: 3,
      annexureConfirmedAt: new Date("2026-09-19T00:00:00.000Z"),
      annexureConfirmedBy: "user_123",
      lineAnnexureId: 3,
      lineVerifiedAt: new Date("2026-09-19T01:00:00.000Z"),
    })).toEqual({ ready: true });
  });
});
