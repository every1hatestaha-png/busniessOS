import { describe, expect, it, vi } from "vitest";

import {
  fbrReferenceDate,
  fetchFbrHsUoms,
  fetchFbrRates,
  parseFbrProvinces,
  parseFbrRates,
  parseFbrTransactionTypes,
  parseFbrUoms,
  plainPercentageRate,
} from "@/lib/fbr/reference";

describe("FBR reference contract", () => {
  it("parses current FBR reference response casing", () => {
    expect(parseFbrProvinces([{ stateProvinceCode: 7, stateProvinceDesc: "PUNJAB" }])).toEqual([{ code: 7, description: "PUNJAB" }]);
    expect(parseFbrTransactionTypes([{ transactioN_TYPE_ID: 75, transactioN_DESC: "Goods at standard rate (default)" }])).toEqual([{ id: 75, description: "Goods at standard rate (default)" }]);
    expect(parseFbrUoms([{ uoM_ID: 13, description: "KG" }])).toEqual([{ id: 13, description: "KG" }]);
    expect(parseFbrRates([{ ratE_ID: 280, ratE_DESC: "0%", ratE_VALUE: 0 }])).toEqual([{ id: 280, description: "0%", value: 0 }]);
  });

  it("distinguishes plain percentage rates from compound rates", () => {
    expect(plainPercentageRate("18%", 18)).toBe(true);
    expect(plainPercentageRate("0%", 0)).toBe(true);
    expect(plainPercentageRate("18% along with rupees 60 per kilogram", 18)).toBe(false);
    expect(plainPercentageRate("18%", 17)).toBe(false);
  });

  it("formats the FBR lookup date in the workspace timezone", () => {
    expect(fbrReferenceDate(new Date("2026-09-19T20:30:00.000Z"), "Asia/Karachi")).toBe("20-Sep-2026");
  });

  it("builds the rate lookup using only the documented query inputs", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://gw.fbr.gov.pk/pdi/v2/SaleTypeToRate?date=19-Sep-2026&transTypeId=75&originationSupplier=7");
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret" }));
      return new Response(JSON.stringify([{ ratE_ID: 734, ratE_DESC: "18%", ratE_VALUE: 18 }]), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(fetchFbrRates({
      token: "secret",
      date: "19-Sep-2026",
      transactionTypeId: 75,
      supplierProvinceCode: 7,
      fetchImpl,
    })).resolves.toEqual([{ id: 734, description: "18%", value: 18 }]);
  });

  it("builds HS/UOM lookup only from an explicit annexure ID", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://gw.fbr.gov.pk/pdi/v2/HS_UOM?hs_code=5904.9000&annexure_id=3");
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret" }));
      return new Response(JSON.stringify([{ uoM_ID: 77, description: "Square Meter" }]), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(fetchFbrHsUoms({
      token: "secret",
      hsCode: "5904.9000",
      annexureId: 3,
      fetchImpl,
    })).resolves.toEqual([{ id: 77, description: "Square Meter" }]);
  });

  it("does not expose a rejected credential in the error", async () => {
    const fetchImpl = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchFbrRates({
      token: "super-secret-token",
      date: "19-Sep-2026",
      transactionTypeId: 75,
      supplierProvinceCode: 7,
      fetchImpl,
    })).rejects.toThrow("FBR rejected the credential for reference-data access.");
  });
});
