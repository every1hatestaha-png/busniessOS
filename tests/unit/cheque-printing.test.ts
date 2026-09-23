import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatPkrAmountInWords } from "@/lib/amount-in-words";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("professional cheque printing", () => {
  it("formats PKR amounts in words for cheque text", () => {
    expect(formatPkrAmountInWords(125_000)).toBe("One Hundred Twenty Five Thousand Rupees Only");
    expect(formatPkrAmountInWords(1_234.5)).toBe("One Thousand Two Hundred Thirty Four Rupees and Fifty Paisa Only");
    expect(formatPkrAmountInWords(0)).toBe("Zero Rupees Only");
  });

  it("keeps physical cheque printing separate from portrait A4 printing", () => {
    const css = source("app/globals.css");
    expect(css).toContain("@page cheque");
    expect(css).toContain("size: 190mm 90mm");
    expect(css).toContain("page: cheque !important");
    expect(css).not.toContain("size: A4 landscape");
  });

  it("provides professional cheque fields without printing application chrome", () => {
    const sheet = source("components/cheques/cheque-print-sheet.tsx");
    expect(sheet).toContain("Payee name");
    expect(sheet).toContain("A/C Payee Only");
    expect(sheet).toContain("Bearer");
    expect(sheet).toContain("amountWords");
    expect(sheet).toContain("chequeDate");
    expect(sheet).toContain("Print voucher / cheque reference");
    expect(sheet).toContain("data-print-surface data-cheque-print");
  });

  it("exposes cheque printing only through cheque payment vouchers", () => {
    const voucherPage = source("app/(dashboard)/accounting/payment-vouchers/[id]/page.tsx");
    const chequePage = source("app/(dashboard)/accounting/payment-vouchers/[id]/cheque/page.tsx");
    expect(voucherPage).toContain('voucher.method === "CHEQUE"');
    expect(voucherPage).toContain("/cheque");
    expect(chequePage).toContain('voucher.method !== "CHEQUE"');
    expect(chequePage).toContain("voucher.cashBankAccount?.isBank");
    expect(chequePage).toContain("formatPkrAmountInWords(voucher.netAmount)");
  });
});
