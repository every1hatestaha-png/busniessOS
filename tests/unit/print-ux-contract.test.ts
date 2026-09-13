import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("print UX regression contracts", () => {
  it("keeps the visual-QA sales fixtures on current per-unit discount semantics", () => {
    const generator = source("tests/visual-qa/generate-documents.js");
    expect(generator).toContain("discountPerUnit");
    expect(generator).not.toMatch(/\bdiscount\s*:/);
  });

  it("covers supplier payment vouchers in fixture generation and capture", () => {
    const generator = source("tests/visual-qa/generate-documents.js");
    const harness = source("tests/visual-qa/visual-qa.cjs");
    const voucherPage = source("app/(dashboard)/accounting/payment-vouchers/[id]/page.tsx");

    expect(generator).toContain("documentIds.supplierPaymentVoucher");
    expect(harness).toContain("supplier-payment-voucher");
    expect(harness).toContain("/accounting/payment-vouchers/");
    expect(voucherPage).toContain("data-document");
  });

  it("keeps statements non-printable until a party is selected", () => {
    expect(source("app/(dashboard)/reports/customer-statement/page.tsx")).toContain("printable={Boolean(statement)}");
    expect(source("app/(dashboard)/reports/supplier-statement/page.tsx")).toContain("printable={Boolean(statement)}");
  });

  it("routes cash-bank printing to the dedicated ledger report", () => {
    expect(source("app/(dashboard)/accounting/cash-bank/[id]/page.tsx")).toContain("/reports/cash-bank?accountId=");
  });

  it("keeps the Electron Ctrl/Cmd+P print accelerator wired", () => {
    const electronMain = source("desktop/main.cjs");
    expect(electronMain).toContain("before-input-event");
    expect(electronMain).toContain('input.key.toLowerCase() === "p"');
    expect(electronMain).toContain("webContents.print");
  });
});
