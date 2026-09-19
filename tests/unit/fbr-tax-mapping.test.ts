import { describe, expect, it } from "vitest";

import { FBR_STANDARD_RATE_SALE_TYPE, validateFbrLineMapping, type FbrLineMappingInput } from "@/lib/fbr/tax-mapping";

function valid(): FbrLineMappingInput {
  return {
    invoiceDate: "2026-09-19",
    sellerProvince: "Punjab",
    hsCode: "0101.2100",
    uom: "Numbers, pieces, units",
    uomId: 77,
    transactionTypeId: 75,
    saleType: FBR_STANDARD_RATE_SALE_TYPE,
    rateId: 734,
    rateDesc: "18%",
    rateValue: 18,
    referenceVerifiedAt: new Date("2026-09-19T08:00:00.000Z"),
    referenceVerifiedForDate: new Date("2026-09-19T00:00:00.000Z"),
    referenceProvinceCode: 7,
    referenceProvinceDesc: "PUNJAB",
    taxRate: 18,
    taxableAmount: 1000,
    salesTaxAmount: 180,
  };
}

describe("FBR sale-line mapping safety", () => {
  it("accepts a fully verified standard percentage mapping", () => {
    expect(validateFbrLineMapping(valid())).toEqual([]);
  });

  it("rejects stale date, province drift and rate mismatch", () => {
    const input = valid();
    input.referenceVerifiedForDate = new Date("2026-09-18T00:00:00.000Z");
    input.referenceProvinceDesc = "SINDH";
    input.taxRate = 17;
    const issues = validateFbrLineMapping(input);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "FBR_RATE_VERIFICATION_DATE_MISMATCH" }),
      expect.objectContaining({ code: "FBR_MAPPING_PROVINCE_MISMATCH" }),
      expect.objectContaining({ code: "FBR_RATE_VALUE_MISMATCH" }),
    ]));
  });

  it("rejects compound rates and unsupported sale types", () => {
    const input = valid();
    input.saleType = "3rd Schedule Goods";
    input.rateDesc = "18% along with rupees 60 per kilogram";
    const issues = validateFbrLineMapping(input);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNSUPPORTED_FBR_SALE_TYPE" }),
      expect.objectContaining({ code: "UNSUPPORTED_COMPOUND_FBR_RATE" }),
    ]));
  });

  it("rejects incomplete immutable snapshots", () => {
    const input = valid();
    input.rateId = null;
    expect(validateFbrLineMapping(input)).toEqual([
      expect.objectContaining({ code: "FBR_LINE_MAPPING_INCOMPLETE" }),
    ]);
  });
});
