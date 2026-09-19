import { describe, expect, it } from "vitest";
import { assertFbrExpectedEnvironment, fbrEndpoint, validateFbrInvoicePayload, type FbrInvoicePayload } from "@/lib/fbr/digital-invoicing";

function validPayload(): FbrInvoicePayload {
  return {
    invoiceType: "Sale Invoice",
    invoiceDate: "2026-09-19",
    sellerNTNCNIC: "1234567",
    sellerBusinessName: "Munshi Test Traders",
    sellerProvince: "Punjab",
    sellerAddress: "Lahore",
    buyerNTNCNIC: "1234567890123",
    buyerBusinessName: "Buyer Pvt Ltd",
    buyerProvince: "Punjab",
    buyerAddress: "Lahore",
    buyerRegistrationType: "Registered",
    scenarioId: "SN001",
    items: [{
      hsCode: "0101.2100",
      productDescription: "Test product",
      rate: "18%",
      uoM: "Numbers, pieces, units",
      quantity: 2,
      totalValues: 2360,
      valueSalesExcludingST: 2000,
      fixedNotifiedValueOrRetailPrice: 0,
      salesTaxApplicable: 360,
      salesTaxWithheldAtSource: 0,
      extraTax: 0,
      furtherTax: 0,
      sroScheduleNo: "",
      fedPayable: 0,
      discount: 0,
      saleType: "Goods at standard rate (default)",
      sroItemSerialNo: "",
    }],
  };
}

describe("FBR digital invoicing contract", () => {
  it("accepts a complete sandbox payload", () => {
    expect(validateFbrInvoicePayload(validPayload(), "SANDBOX")).toEqual([]);
  });

  it("requires scenarioId in sandbox but not production", () => {
    const payload = validPayload();
    delete payload.scenarioId;
    expect(validateFbrInvoicePayload(payload, "SANDBOX")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "scenarioId", code: "REQUIRED" }),
    ]));
    expect(validateFbrInvoicePayload(payload, "PRODUCTION")).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "scenarioId" }),
    ]));
  });

  it("requires a tax identity for registered buyers", () => {
    const payload = validPayload();
    delete payload.buyerNTNCNIC;
    expect(validateFbrInvoicePayload(payload, "PRODUCTION")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "buyerNTNCNIC", code: "REQUIRED" }),
    ]));
  });

  it("allows tax identity omission for unregistered buyers", () => {
    const payload = validPayload();
    payload.buyerRegistrationType = "Unregistered";
    delete payload.buyerNTNCNIC;
    expect(validateFbrInvoicePayload(payload, "PRODUCTION").filter((issue) => issue.path === "buyerNTNCNIC")).toEqual([]);
  });

  it("rejects non-positive quantities and negative amounts", () => {
    const payload = validPayload();
    payload.items[0].quantity = 0;
    payload.items[0].salesTaxApplicable = -1;
    const issues = validateFbrInvoicePayload(payload, "SANDBOX");
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "items[0].quantity", code: "INVALID_QUANTITY" }),
      expect.objectContaining({ path: "items[0].salesTaxApplicable", code: "INVALID_AMOUNT" }),
    ]));
  });

  it("blocks a server operation when the expected FBR environment does not match", () => {
    expect(() => assertFbrExpectedEnvironment("SANDBOX", "SANDBOX")).not.toThrow();
    expect(() => assertFbrExpectedEnvironment("PRODUCTION", "SANDBOX")).toThrow(/environment mismatch/i);
  });

  it("uses the explicit v1.12 sandbox and production DI endpoints", () => {
    expect(fbrEndpoint("SANDBOX", "VALIDATE")).toBe("https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb");
    expect(fbrEndpoint("PRODUCTION", "VALIDATE")).toBe("https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata");
    expect(fbrEndpoint("SANDBOX", "POST")).toBe("https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb");
    expect(fbrEndpoint("PRODUCTION", "POST")).toBe("https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata");
  });
});
