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

  it("covers customer return credit-note documents end to end", () => {
    const fixtureGenerator = source("tests/visual-qa/generate-print-completeness.js");
    const harness = source("tests/visual-qa/visual-qa.cjs");
    const returnPage = source("app/(dashboard)/customer-returns/[id]/page.tsx");
    const salePage = source("app/(dashboard)/sales/[id]/page.tsx");

    expect(fixtureGenerator).toContain("documentIds.customerReturn");
    expect(harness).toContain('name: "customer-return"');
    expect(harness).toContain("/customer-returns/");
    expect(returnPage).toContain("data-document");
    expect(salePage).toContain("/customer-returns/${entry.id}");
  });

  it("captures all dedicated inventory and purchasing report print surfaces", () => {
    const harness = source("tests/visual-qa/visual-qa.cjs");
    expect(harness).toContain('name: "current-stock"');
    expect(harness).toContain('name: "stock-movement"');
    expect(harness).toContain('name: "purchase-price-history"');
    expect(harness).toContain("/reports/current-stock");
    expect(harness).toContain("/reports/stock-movement");
    expect(harness).toContain("/reports/purchase-price-history");
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
    expect(electronMain).toContain('input.key.toLowerCase() !== "p"');
    expect(electronMain).toContain("webContents.print");
  });

  it("uses one tenant-aware workspace identity across shared and manual print headers", () => {
    const identity = source("components/documents/workspace-identity.tsx");
    const documentHeader = source("components/documents/document-header.tsx");
    const reportHeader = source("components/reports/report-company-header.tsx");
    const invoice = source("app/(dashboard)/invoices/[id]/page.tsx");
    const gatePass = source("app/(dashboard)/invoices/[id]/gate-pass/page.tsx");
    const supplierVoucher = source("app/(dashboard)/accounting/payment-vouchers/[id]/page.tsx");

    expect(identity).toContain("getWorkspaceBranding(workspace.name)");
    expect(identity).toContain("src={branding.markPath}");
    expect(identity).toContain("print:block");
    for (const sharedHeader of [documentHeader, reportHeader]) {
      expect(sharedHeader).toContain("<WorkspaceIdentity");
      expect(sharedHeader).toContain("workspace={workspace}");
    }
    expect(invoice).toContain("<WorkspaceIdentity workspace={seller}");
    expect(gatePass).toContain("<WorkspaceIdentity workspace={seller}");
    expect(supplierVoucher).toContain("<WorkspaceIdentity workspace={voucher.workspace}");
  });

  it("waits for workspace logos and fonts before every app-driven print", () => {
    const printButton = source("components/invoices/print-button.tsx");
    const printOnLoad = source("components/documents/print-on-load.tsx");
    const autoPrintReport = source("components/reports/auto-print-report.tsx");
    const printAssets = source("lib/print-assets.ts");

    for (const entry of [printButton, printOnLoad, autoPrintReport]) {
      expect(entry).toContain("waitForPrintableAssets");
    }
    expect(printAssets).toContain("[data-print-surface] img, [data-document] img");
    expect(printAssets).toContain("document.fonts.ready");
    expect(printAssets).toContain("image.decode()");
  });
});
