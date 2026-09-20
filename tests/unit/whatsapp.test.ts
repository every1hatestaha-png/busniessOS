import { describe, expect, it } from "vitest";

import { buildWhatsAppShareUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

describe("WhatsApp sharing", () => {
  it("normalizes common Pakistani mobile formats", () => {
    expect(normalizeWhatsAppNumber("0300-1234567")).toBe("923001234567");
    expect(normalizeWhatsAppNumber("+92 300 1234567")).toBe("923001234567");
  });

  it("preserves already international numbers and encodes messages", () => {
    expect(normalizeWhatsAppNumber("+44 7700 900123")).toBe("447700900123");
    expect(buildWhatsAppShareUrl("03001234567", "Invoice INV-1 balance Rs 1,000"))
      .toBe("https://wa.me/923001234567?text=Invoice%20INV-1%20balance%20Rs%201%2C000");
  });

  it("does not build a share URL without a phone number", () => {
    expect(buildWhatsAppShareUrl("", "Hello")).toBeNull();
  });
});
