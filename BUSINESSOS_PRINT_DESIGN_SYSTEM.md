# BusinessOS Print Design System

Version: D7 draft 1

## Purpose

BusinessOS documents are business records, not screenshots of application pages. The print system must produce legible, consistent, auditable output from authoritative workspace-scoped server data while preserving the accounting meaning of the underlying transaction.

This specification covers invoices, purchase orders, goods received notes, receipts, payment vouchers, credit/debit notes, return notes, expense vouchers, statements, ledgers, aging schedules, and management reports.

## Reference Principles

The design follows three external baselines:

- Common invoice requirements: unique number, issuer identity and contact information, customer identity and address, clear line descriptions, supply and issue dates, charged amounts, taxes where applicable, and total owed. Reference: UK Government, "Invoices - what they must include," https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include.
- CSS paged-media and fragmentation controls for paper size, orientation, page breaks, widows, orphans, and repeating table groups. Reference: MDN, "CSS paged media," https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_paged_media.
- Semantic structure, meaningful reading order, non-color status cues, text contrast, and adaptable presentation. Reference: W3C, WCAG 2.2, https://www.w3.org/TR/WCAG22/.

These references are design baselines, not a claim that BusinessOS output satisfies every jurisdiction's tax-document rules. Pakistan-specific FBR invoice and e-invoicing requirements must be separately mapped before tax-compliance claims are made.

## Non-Negotiable Rules

1. Every document loader authenticates the user and resolves the active workspace on the server.
2. Every root entity lookup includes `workspaceId`; a cross-workspace ID behaves as not found.
3. Direct print URLs enforce the same or stronger permission as the source record.
4. Financial values originate from Prisma `Decimal` fields and authoritative persisted totals. Rendering never recomputes accounting totals with binary floating point.
5. Transaction documents render an immutable issued snapshot once snapshot persistence is available. Reports remain live projections with explicit filter and generation metadata.
6. Status is communicated in text, not color alone. Cancelled, voided, and reversed records retain their original number and display a prominent status stamp.
7. Document content remains understandable in monochrome and at 100% A4 print scale.
8. Tables use semantic `table`, `thead`, `tbody`, and `tfoot` markup. Numeric columns are right-aligned and use tabular numerals.
9. A document does not silently omit applied credits, withholding tax, discounts, reversals, or other components needed to reconcile the displayed balance.
10. Browser "Save as PDF" remains the initial PDF path. A server PDF renderer must consume the same typed view model and cannot become a second source of calculations.

## Document Anatomy

### 1. Screen Actions

Actions are outside the printable sheet and include:

- Back to source record
- Print
- Download CSV for tabular reports when available
- Future PDF download
- Future email/share operation

Actions must be keyboard accessible, have visible focus, and never appear in print.

### 2. Issuer Header

The header contains:

- Workspace legal/trading name
- Address, city, and country
- Phone, email, and future website
- Future logo with meaningful alternative text
- Future tax and registration identifiers

The issuer block is left aligned. The document identity block is right aligned on desktop and stacks below on narrow screens.

### 3. Document Identity

Required fields:

- Document type
- Unique document number
- Issue/transaction date
- Status
- Relevant due, delivery, receipt, or effective date
- Original/duplicate/reprint designation when snapshot support exists
- Snapshot version and reprint timestamp when applicable

### 4. Parties and References

Use titled blocks such as `Bill to`, `Supplier`, `Received from`, or `Paid to`. Include the party name, company name where distinct, address, phone, and future tax identifier when relevant.

References use explicit labels: sales order, invoice, purchase order, GRN, receipt, return, debit/credit note, payment account, department, and external reference.

### 5. Line Table

Line tables provide only fields needed to understand and verify the document. Standard order:

- Sequence
- Item/service description and SKU/reference
- Quantity and unit
- Weight fields when weight-priced
- Unit/rate
- Discount/tax where applicable
- Amount

Weight-priced documents must distinguish stock quantity from kilograms. `Rate/kg` and accepted/returned weight cannot be labeled as stock-unit rate or quantity.

### 6. Totals

Totals form a compact right-aligned reconciliation block. Possible rows:

- Subtotal
- Discount
- Tax
- Gross amount
- Withholding tax
- Customer credit applied
- Payments received/made
- Net cash
- Total
- Balance due

The final payable/receivable amount uses a strong border and weight but remains readable without background color.

### 7. Notes and Terms

Free text wraps and preserves meaningful line breaks. Notes, reason, terms, and remittance instructions are separate labeled regions. User-provided text is rendered as text, never raw HTML.

### 8. Approval and Footer

Signature slots are protected from page splitting. Labels describe the business role rather than assuming a person's name. Footer metadata may include document number, snapshot version, generated timestamp, and page numbering when browser support is reliable.

## Visual Tokens

### Page

- Default: A4 portrait, 12 mm print margin
- Wide reports: A4 landscape through an explicit page/orientation class
- Screen sheet maximum width: 210 mm equivalent, centered
- Screen background: neutral application canvas; paper remains white
- Print background: white; text: black

### Typography

- Application sans-serif font stack; no remote print-only font dependency
- Document title: 18-24 px screen, 16-18 pt print
- Issuer name: 18-22 px
- Body: 12-14 px screen, at least 9 pt print
- Metadata: 10-12 px screen, at least 8 pt print
- Monetary and quantity values: tabular numerals
- Uppercase and tracking are reserved for short labels, never paragraphs

### Color and Borders

- Neutral grayscale is the primary print language.
- Status colors may supplement, never replace, text and border patterns.
- Hairline table rules use neutral 200-300 on screen and solid grayscale in print.
- Dense full-cell borders are reserved for operational count sheets and GRNs; financial reports prefer row rules.

### Spacing

- Base spacing unit: 4 px
- Major regions: 20-32 px screen, 4-8 mm print
- Table cell padding: 6-10 px screen, 1.5-2.5 mm print
- Totals and signature regions use `break-inside: avoid`

## Typed View Model

All transaction renderers and future export adapters consume one serializable server-built structure:

```ts
type DocumentViewModel = {
  schemaVersion: 1;
  kind: DocumentKind;
  id: string;
  number: string;
  status: string;
  issuedAt: string;
  effectiveAt?: string;
  currency: string;
  timeZone: string;
  workspace: WorkspaceSnapshot;
  party?: PartySnapshot;
  references: Array<{ label: string; value: string }>;
  lines: DocumentLine[];
  totals: Array<{ label: string; amount: string; emphasis?: "subtotal" | "total" | "balance" }>;
  notes?: string;
  reason?: string;
  signatures?: Array<{ label: string; name?: string }>;
  snapshot?: { version: number; createdAt: string; reprintedAt?: string };
};
```

Amounts remain decimal strings through the transport/view-model boundary. Formatting receives `currency`, locale, and display precision explicitly.

## Snapshot Architecture

### Transaction Documents

Introduce a generic immutable model only after migration review:

```text
DocumentSnapshot
  id
  workspaceId
  kind
  entityId
  documentNo
  version
  payload Json
  createdAt
  createdById
  supersedesId?
  voidedAt?
```

Required unique constraints:

- `(workspaceId, kind, entityId, version)`
- `(workspaceId, kind, documentNo, version)`

Rules:

- Version 1 is created in the same transaction that issues/posts the document.
- Payload is never updated.
- Corrections create a superseding version or a separate reversal document.
- Reprints render the original snapshot and add current reprint metadata outside the snapshot payload.
- Snapshot retrieval always includes workspace scope.

Until this model ships, current print routes must be documented as live views and must favor existing line snapshots over mutable product relations.

### Reports

Reports remain current computations and include:

- Report title and purpose
- Inclusive period or as-of date
- Applied filters
- Currency and timezone
- Generated timestamp and actor in future audit support
- Row count
- Truncation warning and data-through timestamp
- Reconciliation notes where applicable

## Component Architecture

```text
components/documents/
  document-frame.tsx
  document-header.tsx
  document-status-stamp.tsx
  document-signatures.tsx
  document-totals.tsx
  document-table.tsx

lib/server/documents/
  invoice.ts
  purchase-order.ts
  goods-receipt.ts
  payment-receipt.ts
  payment-voucher.ts
  credit-note.ts
  debit-note.ts
  expense-voucher.ts

lib/documents/
  types.ts
  format.ts
  csv.ts
```

`DocumentFrame` owns paper width, screen/print surface behavior, header placement, and optional status stamp. Domain pages own only business-specific sections. `ReportFrame` remains the report shell and gradually adopts the same issuer and paged-media tokens.

## Authorization Policy

Recommended explicit permissions:

- `sales.documents.read`: sales order, invoice, customer return, credit note, receipt
- `purchases.documents.read`: PO, GRN, supplier return, debit note
- `financial.documents.read`: payment vouchers, expense vouchers, GL-backed documents
- `reports.financial.read`: P&L, GL, cash/bank, statements, aging
- `documents.export`: machine-readable and PDF exports

Until permissions are expanded, preserve the existing policy intentionally:

- invoice, PO, and GRN: `business.read`
- payment and expense vouchers: `financial.manage`
- formal financial reports: `financial.manage`

Every direct URL receives an integration test for allowed roles and cross-workspace IDs.

## Export Strategy

### Phase 1: Browser Print

- Semantic HTML and deterministic print CSS
- Browser print and Save as PDF
- No separate calculation path

### Phase 2: CSV

- Apply to tabular reports and registers, not visual vouchers
- UTF-8 output
- RFC-compatible quoting for commas, quotes, and line breaks
- Prefix or reject spreadsheet formula-leading values (`=`, `+`, `-`, `@`)
- Authenticated, workspace-scoped route with `Content-Disposition`
- Include filter metadata separately or in a documented header format

### Phase 3: Server PDF

- Consume the same view model and snapshot
- Pin renderer/browser and fonts
- Include document metadata and deterministic timestamps
- Compare totals and text against HTML output in contract tests
- Audit actor, entity/filter hash, format, snapshot version, and generation result

## Paged-Media Rules

- Repeat table headers with `thead { display: table-header-group }`.
- Keep totals, notes headings, status stamps, and signature blocks together.
- Avoid breaking ordinary rows where possible; permit safe row fragmentation for exceptionally long descriptions rather than clipping content.
- Set `widows` and `orphans` for prose.
- Do not use fixed-height paper containers; long documents must flow naturally.
- Portrait and landscape are explicit variants, not inferred from viewport width.
- Avoid fixed headers/footers until Chromium print behavior is validated across one-page and multi-page fixtures.

## Accessibility

- Preserve semantic heading order and table header associations.
- Give print/download controls descriptive accessible names.
- Maintain a meaningful DOM reading order when two-column screen regions stack.
- Never convey cancelled/voided/reversed state by color alone.
- Use text alternatives for future logos.
- Maintain contrast in both screen and forced monochrome print.
- Do not reduce print text below the defined minimum to force content onto one page.

## Priority Rollout

1. Correct weighted GRN valuation and printed weight labels.
2. Unify existing invoice, PO, GRN, and supplier payment voucher framing.
3. Disclose customer credit separately on invoices.
4. Add customer payment receipt.
5. Add credit note and customer return documents.
6. Add debit note and supplier return documents.
7. Add expense voucher.
8. Add CSV exports for reports/registers.
9. Add snapshot persistence after migration rehearsal.
10. Evaluate a server PDF renderer only after the HTML/view-model contract is stable.

## QA Matrix

Every document family requires fixtures for:

- Minimal optional data
- Complete branding and party data
- One line
- 25 lines
- 80 lines/multiple pages
- Long names, addresses, SKU, notes, and references
- Large values, fractional values, and negative/reversal values
- Unit-priced and weight-priced lines
- Partial payment, customer credit, and supplier WHT where relevant
- Cancelled, voided, reversed, and superseded states
- Missing optional party/contact fields
- Mixed Latin and Urdu text once supported fonts are selected
- A4 portrait and applicable landscape output

Automated checks:

- Type and builder unit tests
- Loader workspace/RBAC integration tests
- Totals contract tests using Decimal strings
- Chromium print-media screenshots at a pinned viewport/browser version
- Multi-page header, totals, and signature placement checks
- Export MIME type, filename sanitization, formula-injection, and encoding tests

Human release checks:

- Browser preview at 100% scale
- Physical or PDF A4 output
- Monochrome readability
- No clipped columns or content
- Repeated headers and non-orphaned totals
- Reconciliation of every displayed total to the source transaction/report

No release may be described as enterprise print quality until representative one-page and multi-page output has completed this visual QA matrix.
