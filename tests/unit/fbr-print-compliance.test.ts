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

  it("allows production printing only when authoritative submission, QR, and official logo are ready", () => {
    expect(validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "SUBMITTED",
      fbrInvoiceNumber: "123456-200926143000-0001",
      softwareRegistrationNo: "SW-REG-001",
      qrReady: true,
      qrSpecificationVerified: true,
      officialDigitalInvoicingLogoReady: true,
    })).toEqual([]);
  });

  it("reports missing authoritative production invoice metadata", () => {
    const issues = validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "VALIDATED",
      fbrInvoiceNumber: null,
      softwareRegistrationNo: null,
      qrReady: false,
      qrSpecificationVerified: false,
      officialDigitalInvoicingLogoReady: false,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "FBR_PRODUCTION_INVOICE_NOT_SUBMITTED" }),
      expect.objectContaining({ code: "FBR_INVOICE_NUMBER_REQUIRED" }),
      expect.objectContaining({ code: "FBR_SOFTWARE_REGISTRATION_REQUIRED" }),
      expect.objectContaining({ code: "FBR_QR_REQUIRED" }),
      expect.objectContaining({ code: "FBR_QR_SPECIFICATION_CONFIRMATION_REQUIRED" }),
      expect.objectContaining({ code: "FBR_DI_LOGO_REQUIRED" }),
    ]));
  });

  it("keeps production printing blocked until the selected integration route confirms the controlling QR print spec", () => {
    expect(validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "SUBMITTED",
      fbrInvoiceNumber: "123456-200926143000-0001",
      softwareRegistrationNo: "SW-REG-001",
      qrReady: true,
      qrSpecificationVerified: false,
      officialDigitalInvoicingLogoReady: true,
    })).toEqual([
      expect.objectContaining({ code: "FBR_QR_SPECIFICATION_CONFIRMATION_REQUIRED" }),
    ]);
  });

  it("keeps production printing blocked when the official FBR DI logo is not verified", () => {
    expect(validateFbrProductionPrintReadiness({
      environment: "PRODUCTION",
      submissionStatus: "SUBMITTED",
      fbrInvoiceNumber: "123456-200926143000-0001",
      softwareRegistrationNo: "SW-REG-001",
      qrReady: true,
      qrSpecificationVerified: true,
      officialDigitalInvoicingLogoReady: false,
    })).toEqual([
      expect.objectContaining({ code: "FBR_DI_LOGO_REQUIRED" }),
    ]);
  });
});
