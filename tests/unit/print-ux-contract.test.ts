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

  it("keeps long report surfaces pageable instead of clipping them", () => {
    const reportFrame = source("components/reports/report-frame.tsx");
    expect(reportFrame).toContain("print:overflow-visible");
    expect(reportFrame).toContain("overflow-x-auto print:mt-3 print:overflow-visible");
  });

  it("waits for fonts and images before automatic ledger printing", () => {
    const autoPrint = source("components/reports/auto-print-report.tsx");
    expect(autoPrint).toContain("document.fonts?.ready");
    expect(autoPrint).toContain("[data-print-surface] img, [data-document] img");
    expect(autoPrint).toContain("await nextPaint()");
    expect(autoPrint).not.toContain("setTimeout(() => window.print(), 250)");
  });

  it("uses fixed portrait-safe columns for statements and ledgers", () => {
    const statement = source("components/reports/statement-table.tsx");
    const generalLedger = source("app/(dashboard)/reports/general-ledger/page.tsx");
    const cashBank = source("app/(dashboard)/reports/cash-bank/page.tsx");

    for (const report of [statement, generalLedger, cashBank]) {
      expect(report).toContain("<colgroup>");
      expect(report).toContain("print:min-w-0");
    }
    expect(generalLedger).toContain("PARTIAL REPORT");
    expect(cashBank).toContain("PARTIAL REPORT");
    expect(cashBank).toContain("getGeneralLedger");
  });

  it("keeps inventory and aging reports portrait-safe and honest when truncated", () => {
    const currentStock = source("app/(dashboard)/reports/current-stock/page.tsx");
    const stockMovement = source("app/(dashboard)/reports/stock-movement/page.tsx");
    const purchaseHistory = source("app/(dashboard)/reports/purchase-price-history/page.tsx");
    const receivables = source("components/receivables/receivables-table.tsx");
    const payables = source("components/payables/payables-table.tsx");

    for (const report of [currentStock, stockMovement, purchaseHistory, receivables, payables]) {
      expect(report).toContain("<colgroup>");
      expect(report).toContain("print:min-w-0");
    }
    for (const report of [stockMovement, purchaseHistory]) {
      expect(report).toContain("PARTIAL REPORT");
      expect(report).not.toMatch(/PARTIAL REPORT[^\n]*print:hidden/);
    }
    expect(receivables).toContain("print:overflow-visible");
    expect(payables).toContain("print:overflow-visible");
  });

  it("keeps ledger money columns unbroken in portrait print", () => {
    const financialTable = source("components/reports/financial-table.tsx");
    expect(financialTable).toContain("print:whitespace-nowrap print:break-normal");
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
    for (const sharedHeader of [documentHeader, reportHeader]) {
      expect(sharedHeader).toContain("<WorkspaceIdentity");
      expect(sharedHeader).toContain("workspace={workspace}");
    }
    expect(invoice).toContain("<WorkspaceIdentity workspace={seller}");
    expect(gatePass).toContain("<WorkspaceIdentity workspace={seller}");
    expect(supplierVoucher).toContain("<WorkspaceIdentity workspace={voucher.workspace}");
  });
});
