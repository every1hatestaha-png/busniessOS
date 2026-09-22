export type FbrProductionPrintInput = {
  environment: "SANDBOX" | "PRODUCTION" | null | undefined;
  submissionStatus: string | null | undefined;
  fbrInvoiceNumber: string | null | undefined;
  softwareRegistrationNo: string | null | undefined;
  qrReady?: boolean;
  officialDigitalInvoicingLogoReady?: boolean;
};

export type FbrPrintIssue = {
  code: string;
  message: string;
};

export function validateFbrProductionPrintReadiness(input: FbrProductionPrintInput): FbrPrintIssue[] {
  if (input.environment !== "PRODUCTION") return [];

  const issues: FbrPrintIssue[] = [];
  if (input.submissionStatus !== "SUBMITTED") {
    issues.push({
      code: "FBR_PRODUCTION_INVOICE_NOT_SUBMITTED",
      message: "Production FBR printing is blocked until the invoice has an authoritative successful FBR submission.",
    });
  }
  if (!input.fbrInvoiceNumber?.trim()) {
    issues.push({
      code: "FBR_INVOICE_NUMBER_REQUIRED",
      message: "Production FBR printing is blocked until the authoritative FBR invoice number is stored.",
    });
  }
  if (!input.softwareRegistrationNo?.trim()) {
    issues.push({
      code: "FBR_SOFTWARE_REGISTRATION_REQUIRED",
      message: "Production FBR printing is blocked until the FBR-verifiable software registration number is recorded.",
    });
  }
  if (!input.qrReady) {
    issues.push({
      code: "FBR_QR_REQUIRED",
      message: "Production FBR printing is blocked until a Version 2 QR code is generated from the authoritative FBR invoice number.",
    });
  }
  if (!input.officialDigitalInvoicingLogoReady) {
    issues.push({
      code: "FBR_DI_LOGO_REQUIRED",
      message: "Production FBR printing is blocked until the official FBR Digital Invoicing System logo asset is installed and verified.",
    });
  }

  return issues;
}
