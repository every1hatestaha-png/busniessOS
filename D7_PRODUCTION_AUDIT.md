# BusinessOS D7 Production Audit

Date: 2026-09-07

## Scope and Method

This audit traces production behavior through the Next.js routes and pages, server services, Prisma schema, accounting postings, reporting queries, printable views, and existing tests. Findings are classified by operational impact:

- **P0**: immediate authorization, tenant, or financial-integrity risk
- **P1**: material accounting error or missing control in a core workflow
- **P2**: incorrect reporting, incomplete workflow, or significant operational weakness
- **P3**: maintainability, presentation, or defense-in-depth improvement

Status values are **FOUND**, **FIXED**, **DEFERRED**, or **NOT APPLICABLE**. A finding remains **FOUND** until its implementation and regression tests pass.

Database-mutating integration tests were not run during discovery because the configured database was not established as an isolated disposable test database. `npx prisma validate` passed. Static findings were verified end-to-end against current source and existing tests.

## Executive Summary

BusinessOS has strong application-level workspace scoping, immutable GL reversal records, Decimal-backed monetary persistence, and substantial integration coverage. The audit nevertheless found two immediate defects:

1. Invitation acceptance can consume a stale invitation after it has been revoked, including granting the stale higher role.
2. Weight-priced goods receipts can value the product subledger differently from Accounts Payable and the Inventory GL.

The profit-and-loss report also mixes mutable sales-order state with dated GL entries, which misstates both periods when a sale is cancelled in a later period. The financial dashboard includes voided GRNs in current-month purchases. Payment recording is complete, but a general payment reversal workflow is absent despite schema support for reversals.

Printing is functional but fragmented. Four transaction types and the principal financial reports can be printed through browser print CSS, but there is no unified document model, immutable issued-document snapshot, export pipeline, or visual regression coverage.

## Findings

### D7-001: Revoked invitation can still grant workspace membership

- Priority: **P0**
- Status: **FIXED**
- Area: tenant authorization
- Evidence: `lib/server/members.ts:49-56`

`acceptPendingInvitations` reads pending invitations outside the transaction that creates membership. Its transaction then unconditionally upserts membership and changes the invitation to `ACCEPTED`. If an owner replaces or revokes an invitation after the initial read, stale acceptance can recreate the revoked invitation state and grant its former role. Because membership conflict handling uses `update: {}`, a stale higher role can persist.

Required correction:

- Atomically claim an invitation with a conditional update requiring its ID, normalized email, `PENDING` status, and unexpired timestamp.
- Create membership only when exactly one invitation was claimed.
- Ensure replacement and concurrent acceptance have one linearized outcome.
- Add race, duplicate-delivery, expiry, and stale-role regression tests.

Implemented: invitation consumption now conditionally claims the still-pending, unexpired invitation before membership creation. A concurrent revocation that wins the claim prevents membership creation. Focused unit coverage verifies both claim outcomes; broader database concurrency coverage remains part of D7-008.

### D7-002: Invitation acceptance does not require a verified primary email

- Priority: **P0**
- Status: **FIXED**
- Area: identity authorization
- Evidence: `lib/server/clerk-webhook.ts:35-42`, `app/api/webhooks/clerk/route.ts:17-22`

Webhook parsing accepts an arbitrary first email when primary resolution fails and does not inspect Clerk verification state. The event email is immediately used for invitation acceptance. Invitation authorization must fail closed unless the address is the verified primary identity.

Required correction:

- Distinguish identity provisioning from invitation-authorizing email selection.
- Accept invitations only for the verified primary email.
- Do not use the first-address fallback for authorization.
- Add unverified, missing-primary, alias, and malformed-payload tests.

Implemented: Clerk parsing now exposes a separate verified-primary authorization address. Webhook provisioning may retain its existing identity fallback, but invitation acceptance runs only when the primary address carries Clerk's verified status. Parser coverage includes verified snake/camel aliases, fallback, unverified, and direct-primary cases.

Residual risk: webhook snapshots can arrive out of order. Fetching current identity from Clerk or explicit token acceptance would remove that dependency; assess as part of D7-006.

### D7-003: Weight-priced GRNs split the inventory subledger from AP and the Inventory GL

- Priority: **P0**
- Status: **FOUND**
- Area: inventory valuation and accounting
- Evidence: `lib/server/purchases.ts:203-225`, `lib/server/purchases.ts:281-304`, `lib/server/purchases.ts:1133-1153`, `lib/server/purchases.ts:1183-1225`

For weighted lines, commercial and accounting value is `acceptedWeightKg * ratePerKg`. Supplier balance, PO balance, GRN total, and Inventory/AP journal use that value. Product WAC and inventory movements instead use `actualUnitCost * acceptedQuantity`.

When units and kilograms differ, operational inventory value no longer reconciles to the Inventory GL. Subsequent edit, cancellation, void, and return logic can then fail or remove the wrong carrying value.

Required correction:

- Derive one authoritative line value.
- Derive effective stock-unit cost as `lineValue / acceptedQuantity`.
- Use that effective unit cost for WAC and inventory movements on create and edit.
- Preserve weight, rate, and line amount as commercial audit fields.
- Add create, edit, void, cancellation, return, and GL reconciliation tests with unequal quantity and weight.

Data note: existing weighted GRNs require a read-only reconciliation audit before any production data correction. Do not blindly recalculate current product WAC after intervening sales or returns.

### D7-004: Cross-period sale cancellation misstates period profit and loss

- Priority: **P1**
- Status: **FOUND**
- Area: financial reporting
- Evidence: `lib/server/accounting.ts:399-429`, `lib/server/accounting.ts:460-475`, `lib/server/sales.ts:186`

Revenue is calculated from non-cancelled sales orders using their original order dates, while COGS is calculated from dated GL entries. A later-period cancellation removes original-period sales retrospectively but leaves original-period COGS and records the COGS reversal in the cancellation period. This creates a false loss in the original period and false profit in the cancellation period.

Required correction:

- Calculate revenue and contra-revenue from the Sales Revenue GL account, using the same dated-entry policy as COGS.
- Apply the same source policy to the financial dashboard.
- Test same-period and cross-period cancellation, including combined-period net-zero behavior.

Purchase cancellation and GRN void do not directly create this P&L defect because their current entries affect Inventory and Accounts Payable, not income-statement accounts.

### D7-005: Voided GRNs remain in purchases-this-month

- Priority: **P1**
- Status: **FOUND**
- Area: dashboard reporting
- Evidence: `lib/server/accounting.ts:456-458`, `lib/server/purchases.ts:1517-1524`

The dashboard sums every GRN dated in the month without filtering status. Voiding preserves `totalAmount` and changes status to `VOIDED`, so the amount remains reported.

Required correction:

- Filter the current metric to active GRNs, or rename and redesign it as a GL-derived flow metric.
- Add direct void, purchase-cancellation auto-void, period-boundary, and workspace-isolation tests.

### D7-006: Invitation token and user consent are not part of acceptance

- Priority: **P1**
- Status: **DEFERRED**
- Area: onboarding and membership policy
- Evidence: `lib/server/members.ts:23-25`, `lib/server/members.ts:49-56`, `app/api/webhooks/clerk/route.ts:21-22`, `lib/server/onboarding.ts:14-20`

A random invitation token is persisted but never used. Matching webhook email automatically enrolls the user in every pending workspace invitation. A pre-created invitation can therefore determine a new user's initial workspace and prevent normal owner-workspace onboarding without explicit consent.

Recommended product decision:

- Prefer an authenticated invitation page that conditionally consumes a one-time token after verifying the current primary email.
- Stop lifecycle webhooks from granting workspace authorization.
- If auto-accept remains intentional, provide explicit decline/leave behavior and allow invited users to create their own owner workspace.

This is deferred from the atomic P0 fix because it changes onboarding and invitation delivery behavior and requires an explicit product policy.

### D7-007: Owners cannot explicitly revoke a pending invitation

- Priority: **P1**
- Status: **FIXED**
- Area: member administration
- Evidence: `lib/server/members.ts:23-25`, `app/api/v1/members/route.ts`, `components/settings/member-manager.tsx`

`REVOKED` exists, but the only transition occurs when a replacement invitation is created. There is no scoped revocation endpoint or UI action.

Required correction:

- Add an owner-only, workspace-scoped revocation service and route.
- Conditionally update only a pending invitation and audit the operation.
- Add authorization, cross-workspace, already-consumed, and concurrency tests.

Implemented: `DELETE /api/v1/invitations/[id]` requires `members.manage`, scopes the conditional update to the active workspace and pending status, returns conflict for stale/non-pending records, and writes an audit event. Focused service tests cover successful scoped revocation and stale/nonexistent rejection; direct route-role integration remains in the safe DB test gate.

### D7-008: Concurrent duplicate pending invitations are not database-constrained

- Priority: **P2**
- Status: **FOUND**
- Area: membership integrity
- Evidence: `lib/server/members.ts:21-25`, `prisma/schema.prisma:815-832`

Concurrent invitation creation can leave more than one pending invitation for the same workspace and normalized email. The current index is not unique. Serializable service logic reduces the race, but a partial unique database index is the strongest invariant.

Required correction:

- Move existing-member validation into the invitation transaction.
- Use serializable retry for invitation replacement.
- Plan a safe partial unique index on workspace plus normalized email where status is pending.

### D7-009: Standalone customer and supplier payments cannot be reversed

- Priority: **P1**
- Status: **FOUND**
- Area: accounting workflow
- Evidence: `prisma/schema.prisma:714-755`, `lib/server/payments.ts`, `lib/server/suppliers.ts:94-139`

Payment recording exists for customers and suppliers. The schema and aging logic anticipate reversals, but there is no general service, API, or UI to reverse a payment. Sales cancellation only handles its initial payment, while later customer payments and allocated supplier payments block cancellation/void workflows.

Required correction:

- Add an immutable, idempotent payment reversal linked to the original payment.
- Restore allocations, document balances, party balances, cash/bank, WHT, and GL in one transaction.
- Require a reason and effective reversal date, enforce workspace ownership and permission, and audit the operation.
- Add a unique reversal linkage invariant and comprehensive customer/supplier tests.

### D7-010: Cross-period GRN edit uses inconsistent posting dates

- Priority: **P2**
- Status: **FOUND**
- Area: accounting period controls
- Evidence: `lib/server/purchases.ts:1311-1327`

GRN editing reverses the old journal on the edit date but reposts the replacement on the original receipt date. Across periods, this overstates original-period activity and offsets it in the current period.

Required product/accounting decision:

- Prefer a current-date delta journal, or
- introduce closed-period controls and an explicit controlled restatement workflow.

### D7-011: Database does not universally enforce tenant ownership across parent-child references

- Priority: **P2**
- Status: **DEFERRED**
- Area: defense in depth
- Evidence: representative relations in `prisma/schema.prisma:505-525`, `prisma/schema.prisma:840-852`

Many tenant-owned child rows have an independent `workspaceId` plus globally keyed parent foreign keys. The database can represent a child in workspace A linked to a parent in workspace B. Reviewed public mutation paths validate referenced entities against the active workspace, and existing isolation tests cover representative services, so this is not a demonstrated immediate external exploit.

Recommended hardening:

- Add parent uniqueness on `(id, workspaceId)`.
- Migrate high-risk financial relations to composite tenant foreign keys.
- Prioritize payments, allocations, invoices, orders, products, accounts, returns, and GRN chains.
- Design and rehearse the migration against a production-shaped copy before deployment.

### D7-012: API and domain errors are inconsistent

- Priority: **P2**
- Status: **FOUND**
- Area: reliability and client behavior
- Evidence: `lib/server/api.ts`, domain error classes across `lib/server/*.ts`

`ApiError` provides status, code, and message, but domain services use inconsistent plain error classes, codes, and messages. Page-level permission errors also lack a consistent 403 presentation.

Required correction:

- Define a stable domain-error contract and a single API translation boundary.
- Preserve non-sensitive client messages and structured error codes.
- Log unexpected errors with request/workspace correlation without exposing internals.
- Add route tests for validation, authentication, authorization, conflict, not-found, and unexpected failures.

### D7-013: Printed transaction documents are not immutable issued records

- Priority: **P1**
- Status: **FOUND**
- Area: document integrity
- Evidence: `lib/server/invoices.ts:31-65`, `lib/server/purchases.ts:603-689`, `lib/server/purchases.ts:746-810`, `lib/server/suppliers.ts:142-167`

Historical monetary line values are generally persisted, but printable documents load current workspace, customer/supplier, product-unit, account, and settlement data. Editing those records can retroactively change the appearance or identity details of a previously issued document.

Required correction:

- Define immutable versioned document snapshots created atomically at issue/post time.
- Render historical transaction documents from snapshots while reports remain live projections.
- Mark reprints, voids, cancellations, and superseding versions explicitly.

### D7-014: Existing GRN print misrepresents weight-priced lines

- Priority: **P1**
- Status: **FIXED**
- Area: printed-document correctness
- Evidence: `app/(dashboard)/goods-receipts/[id]/page.tsx:71-89`, `app/(dashboard)/goods-receipts/[id]/print/page.tsx:47-60`

The detail view recognizes weight pricing and displays rate per kg and line amount. The print route always presents unit cost and total cost as though the line were unit-priced. Correct this together with weighted inventory valuation and shared document view models.

Implemented: the GRN print route now explicitly displays received and accepted stock quantities separately from received and accepted kilograms, labels weight rates per kg, and uses the persisted weight line amount. It renders through the shared document frame and passed TypeScript and production rendering builds.

### D7-015: Print system is fragmented and lacks export/visual assurance

- Priority: **P2**
- Status: **FOUND**
- Area: print and exports
- Evidence: `components/invoices/print-button.tsx`, `components/reports/report-frame.tsx`, `components/reports/report-company-header.tsx`, `app/globals.css:132-169`

Current output relies on `window.print()` and global A4 portrait CSS. There is no unified transaction-document frame, PDF/CSV/XLSX pipeline, page numbering, landscape mode, repeated document header/footer, or first-party visual regression suite. Several numbered financial records have no printable document: customer receipts, credit notes/customer returns, debit notes/supplier returns, and expense vouchers.

Required correction:

- Define the print design system in `BUSINESSOS_PRINT_DESIGN_SYSTEM.md`.
- Build a typed authoritative document view model and reusable document primitives.
- Align direct print-route RBAC with explicit document policies.
- Add deterministic fixtures for short, long, multi-page, weighted, partially settled, cancelled, voided, and reversed documents.
- Add CSV for tabular reports before committing to a server PDF renderer.

### D7-016: Workspace currency and timezone are not consistently honored in output

- Priority: **P2**
- Status: **FOUND**
- Area: localization and reporting
- Evidence: `lib/utils.ts:8-16`, `components/reports/report-company-header.tsx:44-46`, `lib/validation/reports.ts:27-34`

Workspace currency and timezone are persisted, but output uses hardcoded PKR formatting and Asia/Karachi timestamps in several paths. A reusable document/export layer must receive currency, timezone, and locale explicitly.

### D7-017: Report and register coverage is incomplete

- Priority: **P3**
- Status: **FOUND**
- Area: reporting UX

Sales, invoice, purchase, expense, GRN, and return registers do not consistently use the printable report frame or provide machine-readable exports. Current stock movement also has a hard visible limit without prominent truncation metadata.

Required correction:

- Add visible row-count/truncation metadata.
- Add shared filter metadata and CSV export adapters.
- Prioritize registers based on operational use after core financial correctness is fixed.

## Existing Strengths

- Active workspace selection is constrained to authenticated memberships.
- Reviewed business mutations perform application-level workspace checks on referenced records.
- Formal reports and payment vouchers require `financial.manage`.
- Financial values use Prisma `Decimal` in persistence and critical calculations.
- GL reversals are represented as immutable linked entries.
- Customer and supplier payment recording exists end-to-end.
- Product names/SKUs and commercial line values are snapshotted on several transaction line models.
- Existing report components provide a useful base for a unified document system.
- Print CSS already includes A4 sizing, repeating table groups, exact color adjustment, and row break avoidance.

## Implementation Order

1. Fix D7-001 and D7-002 with invitation authorization regression tests.
2. Fix D7-003 and reconcile weighted GRN create/edit/void/cancellation/return behavior.
3. Fix D7-004 and D7-005 with period-boundary reporting tests.
4. Standardize errors under D7-012.
5. Specify and implement the shared document architecture for D7-013 through D7-016.
6. Add payment reversal under D7-009 after its accounting policy and uniqueness migration are reviewed.
7. Address D7-006, D7-008, D7-010, and D7-011 through explicit product and migration decisions.
8. Complete UX/export coverage and visual QA.

## Release Gates

Before creating the single final D7 installer:

- Every P0 must be **FIXED** with passing regression coverage.
- Every P1 must be **FIXED** or explicitly **DEFERRED** with rationale and operational mitigation.
- Prisma schema validation, TypeScript, unit tests, safe isolated integration tests, Next production build, and desktop smoke tests must pass.
- D6 login, account switching, workspace isolation, persistence, and logout must be manually regression-tested.
- Representative invoice, PO, weighted GRN, payment receipt/voucher, return note, expense voucher, statement, aging, P&L, ledger, and multi-page report output must receive visual print QA.

## Current Validation Checkpoint

Completed on 2026-09-07 after the first D7 implementation pass:

- `npx prisma validate`: passed
- `npx tsc --noEmit`: passed
- `npm test`: 8 files and 91 tests passed
- Targeted ESLint checks: passed
- `npm run build`: passed after preserving a OneDrive-locked generated cache as `.next-d7-locked-20260907`
- `npm run desktop:test`: passed; no real account or database used
- `git diff --check`: passed, with only expected Windows line-ending notices

Not yet completed:

- Database-backed integration tests added for weighted valuation, cross-period P&L, voided-GRN dashboard totals, payment receipt isolation, and new invitation routes
- Visual A4 and multi-page print QA
- Manual D6 real-account regression
- Final packaging
