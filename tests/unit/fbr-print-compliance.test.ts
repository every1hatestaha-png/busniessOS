import { describe, expect, it } from "vitest";

import { validateFbrProductionPrintReadiness } from "@/lib/fbr/print-compliance";

describe("FBR production print gate", () => {
  it("does not restrict ordinary sandbox invoice printing", () => {
    expect(validateFbrProductionPrintReadiness({
      environment: "SANDBOX",
      submissionStatus: null,
      fbrInvoiceNumber: null,
      softwareRegistrationNo: null,
    })).toEqual([]);
  });

  it("fails closed for production until authoritative submission metadata and QR rendering are ready", () => {
    expect(validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "SUBMITTED",
      fbrInvoiceNumber: "123456-200926143000-0001",
      softwareRegistrationNo: "SW-REG-001",
    })).toEqual([
      expect.objectContaining({ code: "FBR_QR_RENDERING_NOT_VERIFIED" }),
    ]);
  });

  it("reports missing authoritative production invoice metadata", () => {
    const issues = validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "VALIDATED",
      fbrInvoiceNumber: null,
      softwareRegistrationNo: null,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "FBR_PRODUCTION_INVOICE_NOT_SUBMITTED" }),
      expect.objectContaining({ code: "FBR_INVOICE_NUMBER_REQUIRED" }),
      expect.objectContaining({ code: "FBR_SOFTWARE_REGISTRATION_REQUIRED" }),
      expect.objectContaining({ code: "FBR_QR_RENDERING_NOT_VERIFIED" }),
    ]));
  });
});
