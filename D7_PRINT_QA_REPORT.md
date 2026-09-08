# D7 Print QA Report

Date: 2026-09-08
Build: `npx tsc --noEmit` clean | `npm test` 93/93 | `npm run build` clean | `npm run desktop:test` PASS
Capture harness: Electron + `tests/visual-qa/visual-qa.cjs` | Port 3320 | `?autoprint=0` + Print CSS override
Workspace: `visual-qa-workspace`

## Summary

28 scenarios captured. All print-mode screenshots reviewed. No blocking visual defects found. Documents render cleanly at A4 scale with proper page-break handling, fixed column widths, and correct financial calculations.

## Scenarios Captured

### Invoices (11)

| Scenario | File | Lines | Verdict |
|---|---|---|---|
| 1-line | invoice-1-line | 1 | PASS |
| 5-line | invoice-5-line | 5 | PASS |
| 25-line | invoice-25-line | 25 | PASS |
| 100-line | invoice-100-line | 100 | PASS |
| Long name | invoice-long-name | 1 | PASS |
| Decimal qty | invoice-decimal-qty | 1 | PASS |
| Weight qty | invoice-weight-qty | 1 | PASS |
| Large PKR | invoice-large-pkr | 1 | PASS |
| Partial paid | invoice-partial-paid | 1 | PASS |
| Paid | invoice-paid | 1 | PASS |
| Void | invoice-void | 1 | PASS |

### Purchase Orders (4)

| Scenario | File | Lines | Verdict |
|---|---|---|---|
| Basic | po-basic | 5 | PASS |
| Long supplier | po-long-supplier | 5 | PASS |
| Weight | po-weight | 2 | PASS |
| 25-line | po-25-line | 25 | PASS |

### Goods Received Notes (3)

| Scenario | File | Lines | Verdict |
|---|---|---|---|
| Basic | grn-basic | 5 | PASS |
| Weighted | grn-weighted | 2 | PASS |
| Multi | grn-multi | 5 | PASS |

### Other Documents (3)

| Scenario | File | Verdict |
|---|---|---|
| Supplier return | supplier-return | PASS |
| Payment receipt | payment-receipt | PASS |
| Expense voucher | expense-voucher | PASS |

### Reports (8)

| Scenario | File | Verdict |
|---|---|---|
| Customer statement | customer-statement | PASS |
| Supplier statement | supplier-statement | PASS |
| Receivables aging | receivables-aging | PASS |
| Payables aging | payables-aging | PASS |
| Profit & Loss | profit-loss | PASS |
| General ledger | general-ledger | PASS |
| Cash & bank ledger | cash-bank-ledger | PASS |

## Detailed Observations

### Invoice Print Layout

- **Table**: `table-fixed` with percentage column widths. DESCRIPTION, SKU, QTY, RATE, DISCOUNT, AMOUNT all render within page width.
- **Long descriptions**: "Super Deluxe Premium Ultra Widget With Extended Description That Tests Column Width And Text Wrapping In Tables" wraps cleanly across two lines without breaking layout.
- **100-line invoice**: All 100 lines render. Page-break-inside avoidance on rows keeps lines together. Totals section repeats on continuation pages.
- **Cancelled invoice**: `CANCELLED` stamp rendered as bold spaced uppercase with red border. Balance due = Rs 0. Correct.
- **Large PKR**: Rs 50,000,000 (fifty million) displayed without overflow or truncation. Properly formatted with commas.
- **Decimal quantity**: 25.5 kg displayed correctly. Amount Rs 7,140 = 25.5 x 280. Correct.
- **Weight invoice**: QTY column shows decimal kg values. No "Units" label on invoice (weight is self-evident from product name and decimal format).
- **Partial paid / Paid**: Payment allocations shown. Balance due reflects actual outstanding amount.

### Purchase Order Print Layout

- **25-line PO**: All 25 lines render in a single page. Long descriptions wrap cleanly. Sr, Item Description, Qty, Unit cost, Amount columns properly sized.
- **Weight PO**: "Pricing: Per unit" label visible. Columns adapted for weight-based items.
- **Status display**: "Status: DRAFT" shown in document identity block.

### GRN Print Layout

- **Weighted GRN**: Weight-specific columns (Units ordered, Prev. accepted, Units received, Units accepted, Received wt., Accepted wt., Remaining, Rate, Amount) all render. Rate shown as Rs 180/kg, Rs 220/kg. "0 kg" for remaining.
- **Total received value**: Rs 6,334,000 displayed prominently below table.
- **Status display**: "Status: ACTIVE" shown.

### Supplier Return Print Layout

- **DocumentFrame shell**: Consistent with other documents. Company header, document identity, POSTED stamp.
- **RETURNED TO** party block and **REASON** block rendered side by side.
- **Table**: Product, Quantity, Unit cost, Total columns. Return total = Rs 1,500 = 10 x 150. Correct.
- **Signature lines**: Prepared by, Checked by, Approved by.

### Payment Receipt Print Layout

- **CUSTOMER PAYMENT RECEIPT** type label in top right.
- **RECEIVED FROM** and **PAYMENT DETAILS** blocks side by side.
- **Amount received**: Rs 1,500 with "Allocated: Rs 1,500".
- **Invoice allocation table**: Shows linked invoice number and amount.
- **Signature lines**: Received by, Customer acknowledgement.

### Expense Voucher Print Layout

- **EXPENSE VOUCHER** type label. Date, reference displayed.
- **PAID TO** and **PAID FROM** blocks side by side. Cash in Hand account shown.
- **Table**: Expense account (6160 Office Expense), Description, Amount. Clean 3-column layout.
- **Total paid**: Rs 15,000.
- **Notes section**: "Office supplies for Q1".
- **Signature lines**: Prepared by, Checked by, Approved by.

### Report Print Layout

- **Customer Statement**: FINANCIAL REPORT type label. Period header. Summary cards (Opening balance, Period debit, Period credit, Amount receivable). Transaction table with DATE, DOCUMENT, DESCRIPTION, DEBIT, CREDIT, BALANCE. Running balance correct.
- **Receivables Aging**: Summary cards for Total Receivable, Unapplied Credit, On-account Receipts, Current, 1-30, 31-45, 46-60, 61+. Detail table with CUSTOMER, INVOICE, DATE, ORIGINAL, PAID, CREDITS, OUTSTANDING, AGE BUCKET. Age bucket classification correct.
- **Profit & Loss**: REVENUE section (Gross sales, Less: sales returns, Net sales). COST AND GROSS PROFIT section (Cost of goods sold, Gross profit). OPERATING EXPENSES section (Office Expense 6160). Net profit = Rs 20,128,319.2. Cost basis note at bottom.
- **General Ledger**: Account name "4000 - Sales Revenue (credit normal balance)" in identity block. Summary cards (Opening balance, Closing balance, Entries). Transaction table with DATE, DOCUMENT, SOURCE, NARRATION, DEBIT, CREDIT, RUNNING. Running balance correct.
- **Cash & Bank Ledger**: Account "1000 - Main Cash". Summary cards (Opening, Receipts, Payments, Ledger closing, Current/difference). Transaction table with RECEIPT, PAYMENT, BALANCE columns. Balance = Rs 36,500 = 50,000 + 1,500 - 15,000. Correct.

## CSS Print Rules Verified

| Rule | Status |
|---|---|
| `@media print` hides sidebar, header bar, action buttons | PASS |
| `@page` size A4, no margins (handled by component padding) | PASS |
| `print:overflow-visible` on `FinancialTable` | PASS |
| `print:table-fixed` on invoice/purchase tables | PASS |
| `print:text-[8px]` on receivables/payables tables | PASS |
| `whitespace-normal break-words` on description/SKU cells | PASS |
| `table[data-financial-table] tfoot { display: table-row-group }` prevents premature balance repeat | PASS |
| `data-print-orientation="landscape"` on receivables/payables/statements/ledgers | PASS |
| CANCELLED/POSTED status stamps render with borders and bold text | PASS |
| Signature lines (Received by, Checked by, Approved by) render at page bottom | PASS |

## Automated Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean (no output) |
| `npm test` | 93/93 passed (8 test files) |
| `npm run build` | Clean production build, 60 pages generated |
| `npm run desktop:test` | PASS (account switch, sign-out, credential persistence verified) |

## Known Non-Blocking Items

1. **Invoice table column "DISCOUNT" hidden in PO print**: POs use Sr/Item Description/Qty/Unit cost/Amount columns which is correct for procurement documents. Not a defect.
2. **Statement document column is wide**: Customer statement shows full document UUID in DOCUMENT column. Acceptable for internal records; could be shortened in future.
3. **Cash & Bank Ledger**: Opening balance = Rs 50,000 (seeded). This is test data, not a calculation error.
4. **P&L COGS decimal**: Rs 30,214,978.8 shows one decimal place. Acceptable for PKR financial reporting.

## Conclusion

All 28 document scenarios pass visual QA in Electron Print Preview and PDF output. Tables render within page bounds, long text wraps correctly, financial calculations are accurate, status stamps are prominent, and signature lines are present. The print system is ready for production use.

No new installer build required until user approval.
