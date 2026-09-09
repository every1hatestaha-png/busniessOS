# D8.1 Print Remediation Report

Date: 2026-09-09
Status: CODE COMPLETE, MANUAL PDF VERIFICATION REQUIRED

## Trigger

A real packaged-app print of Accounts Payable Aging produced three pages. Large dashboard cards consumed page one, the three-row detail table moved to page two, and the result contained excessive whitespace. This real PDF invalidates the earlier D7 visual PASS for that scenario.

## Root Cause

Responsive screen grid breakpoints controlled the printed layout. At the print viewport width, six aging metrics became a two-column grid of full dashboard cards. Their screen padding, icons, secondary text, and large values consumed most of the first page. The table was consequently fragmented onto a later page.

## Remediation

- Added an explicit print-only executive summary grid independent of screen breakpoints.
- Converted aging cards to compact, border-led KPI cells in print.
- Removed decorative metric icons and secondary copy from printed reports.
- Added dedicated report and document print selectors.
- Standardized compact table typography, repeated headings, restrained corporate color, and numeric alignment.
- Tightened report and document headers while preserving issuer, period, and generation metadata.
- Added a consistent confidentiality/document footer.
- Removed viewport height and overflow constraints during print to prevent artificial page spill.
- Applied the summary treatment to payables, receivables, statements, general ledger, cash and bank ledger, and current stock.
- Applied the document table treatment to invoices, purchase orders, GRNs, receipts, returns, and vouchers through the shared document frame.

## Automated Verification

| Check | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Application tests | PASS, 108/108 |
| Git whitespace validation | PASS |

## Manual Acceptance Required

The following must be checked from the packaged Windows app using Microsoft Print to PDF:

1. Accounts Payable Aging starts its detail table on page one and contains no blank trailing page.
2. Accounts Receivable Aging uses the same compact summary hierarchy.
3. Customer and supplier statements repeat table headers across pages.
4. General ledger and cash/bank ledger remain readable in landscape.
5. Invoice, purchase order, GRN, receipt, return, and voucher totals and signatures do not split incorrectly.
6. A physical printer is not required. Microsoft Print to PDF is an acceptable verification target.

This work must not be marked final PASS until those PDFs are visually inspected. Production release remains separately blocked by the D8.1 authentication security matrix.
