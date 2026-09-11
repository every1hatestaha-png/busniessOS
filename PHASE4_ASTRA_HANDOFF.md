# MunshiOS Phase 4 — Astra Handoff

> Naming note: This handoff header says "Phase 4" per the requesting instruction. The actual engineering context is the tail of **Phase 3 Step 3 Batch C — Real Browser Product Validation**. No Phase 4 (production hardening as a separate phase) was started. Treat everything below as the current truth for Phase 3 Step 3 completion.

## 1. EXECUTIVE STATUS

- Current phase: Phase 3 Step 3 (UI/UX V2 + Real Browser QA) — Batch A and Batch B declared PASS (source audit), Batch C in progress.
- Current checkpoint reached: mid-Batch C. Actual browser-driven DOM QA completed for Flows 1, 2, 3 (partial) and 4. Flow 5 (customer statement) NOT started.
- Phase completion: **PARTIAL**. Batch C is NOT complete.
- Overall production-readiness: Source/automated gates are green, and core financial math was verified through the real browser DOM. However, final print visual QA, Flow 5, the full regression matrix, final gates after the latest change, and the Clerk branding defect all remain open. NOT fully production-ready yet.
- Biggest risks remaining:
  1. Print visual QA is UNVERIFIED at pixel level (this agent's model cannot read images/PDFs — see §15).
  2. User-facing Clerk sign-in heading still says **"Sign in to busniessOS"** (branding regression, unpatched — P1).
  3. Flow 5 (customer statement → print) untested.
  4. Final automated gates not rerun after the `lib/server/invoices.ts` change.
- Remaining P0 defects: NONE found to date. All P0/P1 defcts found in this session were: one P1 fixed in-session (invoice query crash), one P1 discovered but NOT yet fixed (Clerk branding), plus minor P3 UX observations.
- Remaining P1 defects: Clerk sign-in heading "Sign in to busniessOS" (C2, unpatched). Everything else is P3/observation.
- Manual browser QA: **YES, real browser used** (installed Edge via Playwright/CDP). DOM-level (innerText) verification performed. Pixel-visual verification **NOT performed** (model limitation).
- Realistic business scenario: PARTIAL — a QA-only scenario was exercised (customer, product, cash account, supplier, sale, GRN, supplier payment, expense) but it was NOT reconciled against a full set of reports (P&L, GL, statements, aging) and Flow 5 is missing.
- Controlled beta recommendation: **NOT READY FOR CONTROLLED BETA** until items in §20/§23 are closed (Clerk branding, print visual QA by a human, Flow 5, final gates, full regression matrix).

## 2. ORIGINAL PHASE 4 OBJECTIVE

(Objective as stated in the Batch C brief; applies to completing Phase 3 Step 3 so the app can move toward beta.)

- Production hardening: find defects that source inspection + 122 unit tests could not find, via real browser use.
- Accounting integrity: per-unit sale discount (Rs 47,500 example), weighted GRN (Rs 62,181 example), supplier Gross/WHT/Net, expense posting.
- Inventory integrity: sale decreases stock, GRN increases stock, adjustments record movement history, WAC behavior.
- Lifecycle safety: verify no dangerous delete/void/reversal of posted financial history during QA.
- RBAC / workspace isolation: existing dual-token auth and role checks must not be broken; no redesign.
- Idempotency: no duplicate submissions; busy states; retry keys.
- Concurrency: at least note races; use safe test data.
- Reports: verify report screens and statement math (Flow 5).
- Print: verify dedicated print layouts for Invoice, PO, GRN, Expense Voucher, Customer Statement.
- Onboarding: verify Settings/Profile visually.
- Real business scenario: exercise five end-to-end workflows with clearly-labelled QA records.
- Controlled beta readiness: reach a decision PASS vs PARTIAL with exact blockers.

## 3. REPOSITORY STATE WHEN YOU STARTED

Inherited from previous agents (Mimo V2.5 / earlier). Key facts from `PHASE3_UI_UX_V2_REPORT.md` at handoff start:

- Branch `main`, repo root `C:\Users\every\OneDrive\Documents\Default Project\business-os`.
- Phase 2/Step1/Step2 commits: `905cfcf`, `52c2a8f`, `d90d78e`. No new commits since (`git log` top is still `d90d78e`).
- Batch A (Sales, Purchases, GRN, Supplier Returns, Supplier Payments, Expenses): declared PASS via source audit + 8 defects fixed + tests expanded 108→122.
- Batch B (Customers, Suppliers, Products, Inventory, Accounting, Reports, Settings, Profile): declared PASS via source audit + 3 fixes (credit limit label, customer list Card, reports max-width).
- Test count when Astra started: **122 tests / 12 files**, all passing.
- Gates green at handoff: prisma validate, tsc --noEmit, 122/122 tests, eslint (`npx eslint app components lib`), `npm run build:web`, `npm run desktop:test` (known navigation-race warning).
- Historical invariants documented: per-unit discount; weighted GRN; creditDays separate from creditLimit ("No monetary limit" / no absurd %); supplier Gross−WHT=Net with over-WHT block; dual-token auth (session_token + oauth_token); print buttons independent of Ctrl+P; MunshiOS user-facing branding (source-level audit claimed no BusinessOS in `app/`/`components/`).
- Dev database confirmed to be the development Neon branch (`ep-icy-recipe-b3fwtekt-pooler.eu-central-1.aws.neon.tech`) — credentials never printed.
- Pre-existing (non-QA) workspace data: customer "Pakstar / Butt bros" (Rs 10,000 receivable, "Over Limit", Rs 60 credit limit, Lahore); suppliers "bilal trading co" and "test supplier"; products "Front hub 150 (HUB-150-ASES)", "Test Product (TEST-001)"; cash accounts "Cash in Hand" (1000) and "HBL main account" (1020). These were NOT modified.
- Several pages ran with the app already: dev server on localhost:3000; desktop test PASS with known log errors (`[D6][logout] failed...` fixture-only), IRRELEVANT to web QA.
- IMPORTANT discrepancy discovered during QA: **visual/pixel verification is NOT possible for this model** — screenshots/PDFs cannot be read. The previous report's phrasing around "visually inspected" should be read as DOM-text inspection.

## 4. WORK COMPLETED BY ASTRA

This session's work = Batch C real browser QA + one defect repair + evidence edits. No broad source audit was repeated.

### Testing infrastructure
- Installed `playwright` (and playwright-core) into a scratch dir OUTSIDE the repo: `C:\Users\every\AppData\Local\Temp\opencode\`.
- Connected to the system's installed **Microsoft Edge** via `--remote-debugging-port=9223` and Playwright `launchPersistentContext({channel:'msedge'})`, viewport 1440x900.
- Wrote reusable scripts in the scratch dir (NOT in repo): `qa.cjs` (CDP runner), `munshi-browser.cjs`, `capture-screen.ps1`.
- Verified dev branch host. Reused already-running dev server on `http://localhost:3000` (killed a stalled PID 340 earlier in the SAME session by a prior attempt; a fresh server started fine).
- Human authenticated once through the Clerk sign-in; QA continued in the authenticated owner session.

### Accounting
- Sale SO-000001: subtotal Rs 50,000, line discount Rs 2,500, total Rs 47,500 verified in live form BEFORE save and on persisted sale detail. PASS.
- Supplier payment BPV-000003: Gross settled Rs 62,181 − WHT Rs 2,181 = Net Rs 60,000 verified live; persisted voucher "BANK PAYMENT VOUCHER" shows gross/WHT/net and allocation PO-000003. PASS.
- Expense EXP-000001: Rs 100 Office Expense from QA Cash, reference QA-FLOW3-20260911; persisted and listed. PASS (posting).
- GL/repots reconciliation: NOT exercised this session.

### Inventory
- QA Product created with PIECE unit, cost 500, selling 1000, opening 100.
- Flow 4 adjustment: ADD 5 → review showed `100 + 5 = 105 piece` → confirmed → stock 105, movement history line `+5 ADJUSTMENT • QA Batch C safe stock addition • balance 105`. PASS.
- Weighted GRN GRN-000003 added +49 (220.5 kg) → movement line `+49 PURCHASE RECEIPT • GRN-000003 • balance 104`; sale removed −50; weighted-average cost updated to Rs 862.32/unit; stock value Rs 89,681.28. Movement history order correct. PASS at DOM level.

### Sales
- Sale form validated per-unit discount exact example. Line shows "Available 105 piece". Customer "Available credit: Not configured" (creditLimit=0) renders cleanly. Detail shows PRODUCT/QTY/UNIT PRICE/DISC/UNIT/LINE TOTAL = 50 / Rs 1,000 / Rs 50 / Rs 47,500. PASS.

### Purchases
- PO-000003 weight-based: 49 pc × 4.5 kg/pc @ Rs 282/kg → live form displayed TOTAL KG `220.500`, UNIT COST `Rs 1,269`, LINE TOTAL and ORDERED VALUE `Rs 62,181` BEFORE save; detail repeats Rs 62,181; receiving summary shows remaining 49→0 after GRN. PASS.

### GRN
- GRN-000003 receiving UI auto-derived received/accepted kg = 220.5 from PO basis when qty 49 entered; user can override measured weight (authoritative model: actual measured accepted weight × rate/kg). Accepted Value Rs 62,181 shown live and persisted. Detail shows Received Now 49pc/220.5kg actual, Accepted/valued 49pc/220.5kg, remaining 0, Rs 282/kg, Rs 62,181. Print GRN target opens. PASS at DOM level (see §15 for visual caveat).

### Supplier Payments
- Supplier detail payout form worked: Allocate Full on PO-000003, WHT 2,181, select QA Cash, Record Voucher → navigated to BPV-000003; supplier ledger gained credit Rs 62,181 "Goods received GRN-000003 (PO PO-000003)". PASS.

### Customer Payments
- Invoice INV-000001: Record payment Rs 10,000 cash into QA Cash → invoice became PARTIALLY PAID, balance 47,500−10,000=Rs 37,500, Payment history row CASH PAY-000002. QA Cash balance 100,000→110,000. PASS.

### Cash / Bank
- Created QA Cash 20260911 with opening Rs 100,000 via "New payment account" form; appeared in account register and in all cash/bank dropdowns with running balance. PASS.

### Validation / Precision
- Customer form uses react-hook-form+zod; email/city/address min-length errors appeared only when empty (generic "Too small: expected string..." — P3 copy issue, not a blocker).
- Product form requires description ≥10 chars (generic message). P3 copy.
- No monetary precision defects observed in any QA transaction.

### Document Lifecycle (observed)
- Only safe operations used: create customer/product/account/supplier, post sale, adjust stock, post GRN, record receipt, record supplier voucher, record expense. No destructive/void/reversal/cancel operations performed during QA.

### UI / UX (observations)
- C2 P1: Clerk-hosted sign-in heading = "Sign in to **busniessOS**" (typo + legacy branding). NOT fixed (external Clerk account appearance; needs Clerk dashboard or code-level override investigation).
- P3: Base UI console warning "component that acts as a button expected a native <button>... nativeButton" at PageHeader action (Sales page). Cosmetic/dev-overlay only, not fixed.
- P3: Invoice lacks an explicit per-line unit label (SKU shows but "Qty" column unlabelled unit).
- P3: Receiving table is wide (~1380px) with horizontal scroll on 1440px viewport — acceptable desktop, note for narrow-width QA.
- Flow self-discovered: QA browser produced multiple tabs; keep subsequent automation on the correct page (see §21).

## 5. DEFECT LOG

| ID | Severity | Area | Problem | Root Cause | Fix | Regression Test | Status |
|----|----------|------|---------|-----------|-----|-----------------|--------|
| C1 | P1 | Invoice / Print | Clicking "Print Invoice" (INV-000001) → generic server error page digest `ERROR560743283`, invoice won't load | `lib/server/invoices.ts:44` raw SQL selects `sales_order_items."discount"` which no longer exists (column is `discountPerUnit`) | Changed SQL SPEL and result type + mapping from `discount` → `discountPerUnit`; removed misleading "(Per-unit)" label on aggregate invoice discount row | `tests/unit/invoices.test.ts` (1 test, mocked `getInvoice`, asserts query uses `discountPerUnit`, params, mapping, and 50×1000−50×50=47500) | FIXED, browser-retested (invoice loads, payment works, totals correct) |
| C2 | P1 | Auth / branding | Clerk sign-in page heading reads "Sign in to busniessOS" — user-facing legacy branding + typo, contradicts "MunshiOS everywhere" | Clerk account/instance appearance config (external) OR app-level override wiring | NOT FIXED. Next step: check `app/(marketing)/layout` / sign-in wrapper for a custom appearance or configure Clerk dashboard; do NOT redesign auth | none yet | OPEN |
| C3 | P3 | Customer form | Required fields expose generic zod messages "Too small: expected string to have >=2 characters" | zod min-length on name/city/address surfaces default message | (optional) provide human-readable messages | none | OPEN (minor) |
| C4 | P3 | Product form | Description min 10 "Too small: expected string to have >=10 characters" | zod min default message | (optional) prettify | none | OPEN (minor) |
| C5 | P3 | Console | Base UI native-button warning on Sales page PageHeader action | `Button` `render`/`nativeButton` semantics | (optional) fix semantics | n/a | OPEN (cosmetic) |
| ─ | ─ | ─ | (Batch A fixes – already fixed by prior agent, preserved; not re-logged) | ─ | ─ | ─ | CLOSED (preserved, see report §Batch A/B) |

Additional HOWEVER: The earlier Batch A/B report claimed "visually inspected" for some items. Astra's model cannot read screenshots/PDFs; treat those earlier visual claims as DOM-text verification unless a human confirms pixel inspection.

## 6. ACCOUNTING INVARIANTS VERIFIED

- Sale posting: Debit Customer / Credit Sales? — NOT directly verified (no GL/ledger query in session). Verified the surface totals only.
- Payments: Invoice balance and cash account moved exactly: 47,500 − 10,000 = 37,500; QA Cash 100,000 → 110,000. PASS (surface).
- GRN posting: Outstanding payable on supplier rose 0 → 62,181 after GRN; supplier ledger credit line appeared. PASS.
- Supplier payment: Gross/WHT/Net = 62,181 / 2,181 / 60,000; voucher document shows all three + PO allocation. PASS.
- Expenses: EXP-000001 ₹100 posted from QA Cash; appears in expense register. PASS (cash-side effect on account not re-queried).
- Debits = credits: NOT independently re-verified in session (was covered by `tests/unit/accounting.test.ts`, 4 tests already green).
- Duplicate posting prevention / idempotency: forms showed busy states and idempotency keys (hidden `idempotencyKey` in record-payment form); single submissions produced single records in QA. Not stress-tested with concurrent/duplicate submissions.
- Void/reversal behavior: NOT exercised in session.

## 7. INVENTORY INVARIANTS VERIFIED

- Sale decreases stock: VERIFIED (100→55 after SO-000001 −50, shown in movement history `SALE` line).
- Adjustment increases stock: VERIFIED (+5, 55→105 wait, actual order: 100 opening → +5 adj → 105 → −50 sale → 55 → +49 GRN → 104; history listed newest-first: GRN +49 balance 104, SALE −50 balance 55, ADJUSTMENT +5 balance 105, OPENING +100 balance 100).
- GRN increases stock: VERIFIED (+49 → 104).
- Weighted/piece valuation/WAC: observed WAC cost updated to Rs 862.32 after GRN; stock value Rs 89,681.28. Calculation unit-not independently recomputed in session.
- Negative stock behavior: NOT tested.
- Reversals: NOT tested.
- Movement history precision and references: VERIFIED (dates, REFERENCE text, direction signs, balances all legible).

## 8. RECEIVABLES / PAYABLES RECONCILIATION

- Receivables: customer detail "Outstanding Rs 47,500" after sale matched invoice balance; after Rs 10,000 payment invoice balance Rs 37,500 (customer card was checked before, not re-read after payment — mark customer-detail balance as partially verified in-session; invoice + record-payment form both showed 37,500).
- Payables: supplier detail "Outstanding payable Rs 62,181" matched PO remaining + supplier ledger credit; after voucher, voucher shows allocation; supplier payable card was read BEFORE voucher (62,181) but NOT re-read after (voucher itself allocates full). Reconciliation across reports (statements, receivables, payables, aging) NOT verified — Flows include Flow 5 to cover customer statement.
- Fixed: none needed; values matched at each read point.

## 9. DOCUMENT LIFECYCLE MATRIX

Not exhaustively re-derived this session. Prior phases verified lifecycle; summary of known rules (from prior reports/code):
- Sales order: once confirmed → creates invoice + stock movement; cancellable via "Cancel Sale" (cancel path exists), not safely editable post-posting.
- PO: ORDERED → GRN → COMPLETED; editable/cancellable while unposted (Edit/Cancel PO buttons observed).
- GRN: ACTIVE ↔ VOIDED (Void GRN button); voids reverse inventory/receiving.
- Supplier return: creates debit note; reversible via reversal path (not exercised).
- Payments/expenses: recorded, reversable (isReversed flags seen in invoice query `payments.isReversed`, `reversalOfId`).
- Products: ACTIVE/ARCHIVED/delete (archive/remove buttons observed).
- Inventory adjustment: permanent movement; no delete observed.
Full authoritative matrix lives in prior artifacts (refer to `PHASE3_UI_UX_V2_REPORT.md` §Batch A and the D8 lifecycle work commits `000e22c`, `f6bf037`). QA did not break any rule.

## 10. RBAC / SECURITY / WORKSPACE ISOLATION

- Session used the single OWNER role. No cross-role or cross-workspace test performed in-session.
- Observed server logs show dual-token auth path (`tokenType=session_token`) and workspace-scoped queries (`WHERE workspaceId=...`); `requireWorkspace` gate passed in every page render.
- No auth redesign. The auth invariant (email alone insufficient; second factor / OAuth consent ≠ auth; PKCE/state/safeStorage) from Phase 3 Step 2 audit remains untouched.
- Sensitive logging: DATABASE_URL host verified without printing; no raw credentials in tool output.
- IDOR risk: every query shown is workspace-scoped. NOT adversarially tested.

## 11. IDEMPOTENCY / CONCURRENCY

- Idempotency keys: observed hidden `idempotencyKey` in RecordPaymentForm; supplier payment and expense forms (Batch A fixes) preserve inputs and re-use key on retry.
- Double-submit protection: submit buttons disabled while busy; "Record voucher" state machine (`recorded`, `retryRequired`) observed in code (prior batch) — single records confirmed in QA.
- Database constraints: no new constraints added this phase.
- Races: supplier-payment purchases-load uses AbortController; not stress-tested. Concurrent double-click/concurrent-post NOT tested; recommend a manual rapid double-submit check on sale + receipt + expense + voucher as NEXT-step item.

## 12. DATABASE AND MIGRATIONS

- **No migrations added.**
- No schema changes made in this session. Concern: the invoice SQL refactor relies on existing column `discountPerUnit` (present in schema per prior D8.1 work `prisma/schema.prisma`). `npx prisma validate` was PASS before the change; re-run after change (see §13).

## 13. TEST SUITE

- Test count before Astra: 122 (12 files).
- Test count now: **123 (12 files)** — added `tests/unit/invoices.test.ts` (1 test) created by repair agent during C1 fix.
- Latest observed results:
  - `npm test -- tests/unit/invoices.test.ts` → **1 passed** (ran after C1 fix).
  - `npm test` (full): PASS **before** the C1 change (122). Full suite NOT rerun after the change.
  - `npx prisma validate`: PASS before change; NOT rerun after.
  - `npx tsc --noEmit`, `npm run build:web`: PASS before change; NOT rerun after.
  - `npm run desktop:test`: PASS before change (nav-race warning); NOT rerun after.
  - `npx eslint app components lib`: PASS before change; NOT rerun after.
- → **Final gates are red-unknown until rerun post-change.** This is an explicit NEXT-step.

## 14. MANUAL BROWSER QA

Real browser (installed Edge, `<channel>='msedge'`) via Playwright/CDP, 1440×900, authenticated OWNER session against localhost:3000 dev server, development database. Data = QA-labelled records only (`qa-customer-20260911@example.com`, QA Supplier, QA Product, QA Cash 20260911, QA Expense).

| Workflow | Status | Evidence / notes |
|---|---|---|
| Flow 1 Customer → Sale → Payment → Invoice → Print | **PARTIAL** | Sale 47,500 PASS; payment 10,000 → 37,500 PASS; invoice loads after C1 fix PASS; Print button opened native edge://print (visual unverified); `invoice.pdf` generated but model could NOT read PDF pixels — needs human eyes |
| Flow 2 Supplier → PO → GRN → Payment → Print | **PARTIAL** | PO/GRN 62,181 PASS; WHT voucher 60,000 PASS; GRN + PO prints opened; `grn.pdf`/`po.pdf` generated, human visual check required |
| Flow 3 Expense → Detail → Print | **PARTIAL** | EXP-000001 recorded + detail read; "Print voucher" present (uses window.print — no tab); `expense.pdf` generated, human check required |
| Flow 4 Product → Inventory movement | **PASS at DOM level** | Adjustment +5 → 105 with correct history; sale/GRN stock effects verified |
| Flow 5 Customer → Statement → Print | **NOT TESTED** | No statement exercised |

Additional browser workflows actually exercised: customer create, product create, cash-account create, supplier create, PO create, GRN post, supplier payment voucher, expense, sale, customer payment, invoice view/print. NOT exercised: customer statement, P&L, GL, aging, returns, reversals/voids, cancel flows.

## 15. PRINT QA

- **MODEL LIMITATION (must not be ignored by next agent):** this agent's model cannot ingest images or PDFs. Browser screenshots and `*.pdf` files were written to `C:\Users\every\AppData\Local\Temp\opencode\` but their **visual content was NOT readable** by the agent. The native `edge://print/` preview surface returned blank captures. Therefore NO pixel-level print verification exists yet. HTML/DOM text of print routes was verified for invoice & GRN & PO & expense.

| Document | DOM text verified | Rendered PDF generated | Visual (pixel) verified | Status |
|---|---|---|---|---|
| Invoice | YES (values correct, 1 page structure) | invoice.pdf | NO — needs human | CODE/DOM verified only |
| PO | YES (62,181 line) | po.pdf | NO | CODE/DOM verified only |
| GRN | YES (weight/value/signatures) | grn.pdf | NO | CODE/DOM verified only |
| Expense Voucher | YES (gateway detail) | expense.pdf | NO | CODE/DOM verified only |
| Customer Statement | NO | – | – | NOT VERIFIED |

(For reference, earlier phases did verify print layouts exist as dedicated pages: `purchases/[id]/print`, `goods-receipts/[id]/print`, `invoices/[id]` with `@media print` CSS, `PrintButton` uses `window.print()`. But final "VISUALLY VERIFIED" label requires a human, per the brief.)

## 16. REAL BUSINESS SCENARIO

Started but incomplete. QA-only ledger created:

- Company: existing "KHZR" workspace (untouched).
- Customer: QA Customer 20260911 (`0f8bbbc7-...`) — 30-day credit, no limit, zero opening.
- Product: QA Product 20260911 (`06b863af-...`) — PIECE, cost 500, sell 1000, open 100.
- Cash: QA Cash 20260911 — opening 100,000.
- Supplier: QA Supplier 20260911 (`c05dc8a0-...`).
- Documents: SO-000001 (47,500), INV-000001 (47,500, paid 10,000 → 37,500), PO-000003 (62,181), GRN-000003 (62,181), BPV-000003 (62,181−2,181=60,000), EXP-000001 (100).
- Expected vs actual (each individually verified at DOM): sale math ✓, GRN math ✓, WHT math ✓, stock 104 ✓, WAC 862.32 ✓, receivable 37,500 ✓, payable media 62,181 (pre-voucher) ✓.
- **NOT completed:** reconciliation across P&L, GL, statements, aging, receivables/payables list pages; Flow 5; native print; closing balances. Scenario intentionally left in STATE SO THAT next agent can finish it (no reset).

## 17. FILES CHANGED

Changed in THIS session (Batch C):
- `lib/server/invoices.ts` — SQL/type/mapping `discount`→`discountPerUnit`.
- `app/(dashboard)/invoices/[id]/page.tsx` — removed "(Per-unit)" annotation on aggregate discount row.
- `tests/unit/invoices.test.ts` — NEW, regression test for getInvoice (1 test).
- `PHASE3_UI_UX_V2_REPORT.md` — added "BATCH C — REAL BROWSER PRODUCT VALIDATION" section (in progress evidence).

Pre-existing uncommitted Batch A/B work (preserved, NOT touched this session): the 21 modified files listed by `git status` (expenses page, customers page/detail, dashboard, layout, purchases/new, reports, sales/[id], supplier-returns, globals.css, expense-form, metric-card, page-header, status-badge, goods-receipt-form, top-nav, supplier-return-form, supplier-payment-form, desktop/main.cjs, tests sale-validation + grn-calculations, customer page again, PLUS `PHASE3_UI_UX_V2_REPORT.md`).

Scratch test tooling (NOT committed, lives at `C:\Users\every\AppData\Local\Temp\opencode\`): `qa.cjs`, `munshi-browser.cjs`, `capture-screen.ps1`, plus screenshots/PDFs. Browser user-data dir `munshi-qa-edge`.

## 18. GIT STATE

- Branch: `main`.
- **No commits created by Astra.** Latest commit remains `d90d78e`.
- `git log --oneline -10` top: `d90d78e` (phase 3 step 2), `52c2a8f`, `905cfcf`, `883b21e` (BusinessOS v0.2.1), `561615d`, `b987fc0`, `a3889bd`, `000e22c`, `f6bf037`, `ccf165e`.
- Uncommitted: 23 tracked-modified files (Batch A/B 21 + invoices.ts + invoices/[id]/page.tsx) + untracked `PHASE3_UI_UX_V2_REPORT.md` + untracked `tests/unit/invoices.test.ts`. (Also untracked `.next/dev/logs` is ignored.)
- CRLF warnings appear on diff (cosmetic; Git is configured to warn on line-ending normalization — do NOT touch).
- Do NOT commit until the user explicitly asks.

## 19. REPORTS / DOCUMENTATION CREATED

- `PHASE3_UI_UX_V2_REPORT.md` — updated with "BATCH C — REAL BROWSER PRODUCT VALIDATION" (environment/evidence, per-flow records incl. C1 defect + fix + retest, historical regression matrix draft, print QA matrix draft, decision PARTIAL).
- `PHASE4_ASTRA_HANDOFF.md` — this document.
- Prior artifacts still present: `PHASE3_AUTH_AUDIT.md`, `D8_1_PACKAGED_APP_DEFECT_REPORT.md`.
- NO new PHASE4 production-hardening report was created (Phase 4 not started).

## 20. CURRENT BLOCKERS

1. **Human visual print verification (mandatory):** open `invoice.pdf`, `po.pdf`, `grn.pdf`, `expense.pdf` (at `C:\Users\every\AppData\Local\Temp\opencode\`) OR repeat in a browser and confirm pixel-level layout. Agent cannot see pixels.
2. **Clerk branding C2 (P1, OPEN):** "Sign in to busniessOS" visible. Determine where Clerk branding comes from (Clerk dashboard instance appearance vs. app code). Candidate: check `app/(auth)`/layout and any `<ClerkProvider appearance>`; if none, it's the Clerk dashboard "Brand" setting — needs user access to viable-giraffe-1379.clerk.accounts.dev. Do NOT redesign auth.
3. **Flow 5 Customer → Statement → Print** not started.
4. **Final automated gates NOT rerun** after the `invoices.ts` change (prisma validate, tsc, full npm test, build:web, desktop:test, eslint).
5. **Full regression matrix** incomplete (returns, reversals, voids, cancel, P&L/GL/aging reconciliation are the untested rows).
6. **Narrow-width sanity check** (mobile/narrow desktop) not performed.
7. **Real business scenario reconciliation** incomplete (see §16).
8. **Double-submit/concurrency stress** (rapid double-click on receipt/voucher/expense) not performed.
9. No human auth needed right now — the owner session is live in the QA browser profile `munshi-qa-edge`.

## 21. NEXT AGENT — EXACT CONTINUATION PLAN

Resume with the QA browser still authenticated (profile dir `C:\Users\every\AppData\Local\Temp\opencode\munshi-qa-edge`, CDP port 9223, scripts in that same folder). Do NOT re-audit all screens.

- **NEXT 1 — Fix C2 Clerk branding.** Area: auth/branding. Why: user-facing P1, mandatory pre-beta. Relevant: search repo for Clerk `appearance`/`sign in` strings; else instruct human to fix Clerk dashboard brand field (instance `viable-giraffe-1379`). Completion: sign-in page reads "MunshiOS" with no typo and no lingering "businessOS"/"busniessOS".
- **NEXT 2 — Human visual print QA.** Ask the user (or run a headed Edge session and capture) to open invoice.pdf/po.pdf/grn.pdf/expense.pdf and each print route; record per-doc verdicts into the PRINT VISUAL QA MATRIX. Completion: all 5 documents marked VISUALLY VERIFIED or specific defect filed.
- **NEXT 3 — Flow 5 Customer Statement → Print.** Steps: QA customer detail → statement with period filter covering today → verify opening/entries/closing (expect opening 0, debit 47,500, credit 10,000, closing 37,500) → Click Print → inspect PDF. Completion: DOM PASS + PDF produced.
- **NEXT 4 — Final gates after C1 change.** Run `npx prisma validate`; `npx tsc --noEmit`; `npm test` (expect 123/123); `npm run build:web`; `npm run desktop:test`; `npx eslint app components lib`. Completion: all green.
- **NEXT 5 — Complete regression matrix rows.** Browser: Supplier Return (create against GRN-000003 if safe, or a new tiny QA GRN), Cancel Sale, Void GRN, payment reversal, and P&L/GL/aging spot-checks that include QA records. Completion: every historical-regression checkbox has evidence.
- **NEXT 6 — Entity reconciliation.** Verify receivable 37,500 and payable 0 (post-payment) and cash 99,900 (100,000+10,000−60,000−100) across Customer/Supplier detail, Receivables/Payables lists, statements, and GL. Completion: all agree; file any mismatch as new defect.
- **NEXT 7 — Narrow-width sanity.** Set viewport ~390px or 768px on key pages (dashboard, sale, GRN, report). Completion: no broken layout/overflow unhidden on critical inputs.
- **NEXT 8 — Idempotency/concurrency sweep.** Rapid double-submit each mutation manually; assert single record. Completion: single records; fix anything duplicated.
- **NEXT 9 — Cleanup + report.** Remove P3 copy polish if cheap, resolve `PHASE3_UI_UX_V2_REPORT.md` Batch C section to final PASS/FAIL per flow, run final gates again if code changed, then present completion decision (COMPLETE-PASS vs PARTIAL with exact blockers) to the user. Do not commit unless asked.

## 22. DO NOT REGRESS

Preserve (verified historically + this session):
- Per-unit sales discount (50×1000−50×50=47,500) — sale form, sale detail, invoice query (now `discountPerUnit`).
- Weighted GRN = accepted kg × rate/kg (49×4.5=220.5 kg × 282 = 62,181).
- `creditDays` separate from `creditLimit`; zero/negative limit renders "No monetary limit"/"Not configured", never absurd utilization %.
- Supplier payment semantics: Gross settled − WHT = Net; block over-WHT.
- Dual-token auth (session_token/oauth_token); workspace-scoped queries on every server path.
- No hard-delete of posted financial history where unsafe; void/reversal rather than delete.
- Dedicated print layouts (`/print` routes, `@media print`, `PrintButton` window.print) — keep print UI out of app shell.
- MunshiOS user-facing branding everywhere (fix the Clerk instance brand string).
- Keep `.next/dev` logs untracked; keep scratch playwright tooling OUT of the repo; never print DATABASE_URL.

New invariant from this session: **invoice line-item SQL must reference `discountPerUnit`** (C1). If migration renames price columns again, update `lib/server/invoices.ts` and its test simultaneously.

## 23. FINAL ENGINEERING ASSESSMENT

"If a real Pakistani SME used MunshiOS tomorrow with real money, inventory, customer balances, supplier balances, and employees, what could still go wrong?"

- Brand/trust: the auth screen says "busniessOS" — customers/employees see wrong legacy branding. Pre-beta blocker (P1).
- Financial correctness: core math verified in-browser for sale, GRN, WHT, receipt, expense, stock. Still unverified: report reconciliation (P&L/GL/statements/aging), reversals/voids of posted docs, deep double-submit races, and a single cross-checking scenario from first entry to closing balances. Any bug there post-launch would corrupt bookkeeping.
- Data safety on revert paths: void/reversal flows not exercised; a misapplied void or cancel could move stock/cash twice.
- Concurrency: an employee double-clicking "Record voucher"/"Receive goods" is unguarded by DB unique constraints beyond idempotency keys in client state; two devices simultaneously could race.
- Operational integers: unit column is implicit on the invoice (only SKU displayed) — minor, but a misread qty/unit could affect physical dispatch.
- There is no evidence of broken workspace isolation, but adversarial cross-workspace IDOR tests are absent — a real security finding requires them before multitenancy is trusted.
- Performance with large ledgers (wide GRN table min-width 1380px; reports truncating at 2000 rows) untested at SME scale.

Verdict: **NOT READY FOR CONTROLLED BETA.** Core math is strong and the P0 has been fixed; but the unpatched P1 Clerk branding, an unpixelled print matrix, a missing Flow 5 + full reconciliation, unchecked void/reversal and concurrency, and un-rerun final gates all block a responsible beta claim. Closing NEXT 1–NEXT 8 flips this to READY.

---

ASTRA HANDOFF: COMPLETE
- Phase: Phase 3 Step 3 Batch C (labelled "Phase 4" per request) — PARTIAL
- Current test count: 123 (12 files) — full suite must be re-run post-fix
- P0 remaining: 0
- P1 remaining: 1 (Clerk "busniessOS" branding, OPEN)
- Manual QA: Real Edge browser used; DOM-level verified for Flows 1–4; Flow 5 NOT started; pixel-level print visuals NOT verified (model cannot read images/PDFs) — human required
- Real business scenario: PARTIAL (QA ledger exercised, no full-report reconciliation)
- Controlled beta recommendation: NOT READY FOR CONTROLLED BETA (7 concrete blockers, §20)
- Handoff file: PHASE4_ASTRA_HANDOFF.md (this file)
- Latest git state: branch `main`, HEAD `d90d78e` (no new commits), 23 modified + 2 untracked files uncommitted

Next Agent Quick Start:
1. Continue in the live authenticated QA browser (Edge profile `munshi-qa-edge`, CDP 9223, scripts in `Temp\opencode`) — do not re-audit screens.
2. FIX C2: Clerk page says "Sign in to busniessOS" — find the branding source (app appearance vs Clerk dashboard brand) and make it say MunshiOS.
3. Get a HUMAN to pixel-verify invoice.pdf/po.pdf/grn.pdf/expense.pdf (files already generated) and fill the print matrix.
4. Run Flow 5 (customer statement) with QA Customer 20260911; expect opening 0 / debit 47,500 / credit 10,000 / closing 37,500; produce PDF.
5. Re-run final gates after the invoices.ts change (prisma validate, tsc, npm test=123, build:web, desktop:test, eslint).
6. Complete remaining regression rows: supplier return, cancel sale, void GRN, payment reversal, P&L/GL/aging spot-checks.
7. Reconcile end-state: receivable 37,500, payable 0, cash 99,900 across all surfaces; file any mismatch.
8. Do 768px/390px sanity pass on dashboard/sale/GRN/report.
9. Rapid double-submit each mutation and assert a single record.
10. Polish the P3 copy (generic zod messages) only if time; finalize PHASE3_UI_UX_V2_REPORT.md; DO NOT COMMIT unless the user asks.