import { describe, expect, it } from "vitest";

import {
  buildFbrInvoiceQrSvg,
  FBR_QR_MODULE_COUNT,
  FBR_QR_VERSION,
  FbrQrError,
} from "@/lib/fbr/qr";

describe("FBR production QR", () => {
  it("encodes the authoritative FBR invoice number as Version 2 QR data", () => {
    const invoiceNumber = "123456-200926143000-0001";
    const result = buildFbrInvoiceQrSvg(invoiceNumber);

    expect(result.payload).toBe(invoiceNumber);
    expect(result.moduleCount).toBe(25);
    expect(FBR_QR_VERSION).toBe(2);
    expect(FBR_QR_MODULE_COUNT).toBe(25);
    expect(result.svg).toContain("<svg");
  });

  it("trims surrounding whitespace without changing the invoice number", () => {
    expect(buildFbrInvoiceQrSvg("  123456-200926143000-0001  ").payload)
      .toBe("123456-200926143000-0001");
  });

  it("fails closed when no authoritative FBR invoice number exists", () => {
    expect(() => buildFbrInvoiceQrSvg("   ")).toThrow(FbrQrError);
  });

  it("fails closed when the value cannot fit the required Version 2 QR", () => {
    expect(() => buildFbrInvoiceQrSvg("X".repeat(64))).toThrow(FbrQrError);
  });
});
