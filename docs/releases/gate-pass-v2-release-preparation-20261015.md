# Gate Pass V2 release preparation — 15 October 2026

## Verified baseline and reproduced defects

- Main and Vercel production: `757b0e9c29c2459b46b244a32bdcd215c1205eb1` (merged #344). Deployment `dpl_3L6WiUoXJMy9rT5MFiYBWbrxjQjA`, READY, `www.munshios.tech` alias. The seven workflows on #344's final head were green; these are baseline evidence only.
- Public `/api/readiness` currently returns **503 / schema_pending**. Production builds skip migrations (`RUN_PRISMA_MIGRATIONS_ON_BUILD=0`). A successful deployment is not operational acceptance.
- **Reproduced 404 defect:** web and Electron Ctrl+P matched `/gate-passes/new`, `/gate-passes/pending-invoices` and `/gate-passes/in-transit` as detail IDs and constructed `/print` URLs. Three new unit cases failed on the original code. Authenticated local calls to the real print page return `NEXT_HTTP_ERROR_FALLBACK;404` for these IDs. This identifies a concrete defect, not proof that it was Ahmad's original incident; his exact URL remains unavailable. No matching recent retained runtime logs were found; Hobby rejected the 24-hour query, and the supported 30-minute query was empty.
- Existing drafts had no edit action/page. Added a route using the existing draft form, persisted permissions/entitlement/tenant gates, a row lock and optimistic version checks. Editing preserves document number, creation idempotency and all stock/finance state. Same-payload replay is a no-op; stale edits and edits after issue/cancel are refused.
- Fractional BOM acceptance/returns independently rounded portions of a cent and could disagree with inventory GL by one paisa. Two disposable regressions failed before the fix. Currency now allocates the rounded remainder consistently across COGS, cumulative returns and transit; multi-line accepted cost is summed at the same per-line precision. Physical quantities and immutable snapshots are preserved.
- Ctrl+P excludes static routes, and both web/desktop handlers require a printable detail marker. Draft/cancelled/not-found screens cannot be redirected into an invalid document. Existing print-page authorization remains intact.

## Database identity and current history

The deployed readiness code first checks `config/database-targets.json`. A `schema_pending` response proves that check passed; a rejected connection would instead return `database=unavailable`. All four allowed direct/pooled aliases map, via Neon compute metadata, to:

- Project `gentle-hall-80438999`, branch `br-hidden-tree-b3ecieqd`, database `neondb`.
- Endpoint `ep-plain-smoke-b35qxc96`; direct host `ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech`.
- No production `MUNSHIOS_DEPLOYMENT_ENVIRONMENT` override was listed.

This is a credential-free runtime/allowlist attestation, **not** a direct comparison of the deployed Sensitive DATABASE_URL. Vercel will not export that value. The owner has no approved local secret reference and explicitly requires a securely verified connection before production changes. Consequently **no hosted migrations, activation, merge or deployment were executed**.

Read-only catalog inspection on that mapped branch: **133 successful migrations**, no active failed migration, one historical rolled-back attempt (`20260912070000_weighted_sales_defaults`). All successful checksums match repository files. Expected chain: **136**. `issueStockDeductedAt` is absent. Pending, in dependency order:

| Migration | Reviewed change | SHA-256 |
|---|---|---|
| `20261014133000_outbound_gp_issue_stock_marker` | Nullable timestamp; check requires issuedAt for marked rows. Existing rows stay NULL. | `6a6802ccebfb9120c51a5a1251bc988a257e8dbb19188ffd977fc51c0357c221` |
| `20261014134000_outbound_gp_issued_valuation_immutable` | Replace existing valuation trigger function; marked V2 stock is immutable, NULL markers preserve legacy behavior. | `e00b61bd065961ed00e355326f8006913dcd221efad1a2f2b7a758567cc94cdf` |
| `20261014153000_outbound_gp_issue_time_stock` | Add `GATE_PASS_ISSUE` and `GATE_PASS_ISSUE_CANCEL` enum labels. | `e86c49a9d5158b7bb9e073a38901bd5ea8034a7e65870876cd9a67897cc90819` |

These migrations contain no customer-data UPDATE/DELETE, table drop or reseed. DDL locks still require an operator-controlled window. Enum additions are permanent catalog additions: rollback leaves the additive schema in place; never reset/resolve/rewrite the ledger or attempt automatic enum removal.

## Executed nonproduction evidence

- Fresh local PostgreSQL **18.4**, loopback only. Full **136-migration** chain applied, checked individually against SHA-256, with no pending/failed rows.
- `scripts/rehearse-gate-pass-v2-upgrade.cjs`: creates a NEW loopback DB only; deploys first 133 migrations, inserts synthetic legacy DRAFT/ISSUED/IN_TRANSIT fixtures, deploys the reviewed three, verifies **74 business-table fingerprints unchanged**, all legacy issue markers NULL, 136 matching checksums, and a no-op second deploy. It refuses hosted targets, wrong DB names and existing databases. A first seed attempt had a PostgreSQL enum parameter-type conflict; corrected the fixture and reran on a different fresh DB without resetting or altering the failed DB's ledger.
- Local focused suite before the final route additions: **97 PASS**, including **34 real PostgreSQL lifecycle cases**. Additional actual print-route/invoice rendering selection: **4 PASS**. Exact candidate CI counts are recorded in the PR after completion.
- Coverage includes V2/legacy issue-dispatch compatibility, managed warehouses/BOM components, last-stock concurrency, issue replay, pre-dispatch cancel/replay, historical valuation, receiving/replay, accepted-only invoices/replays, customer credit races, role removal/downgrade, foreign tenants, direct DB boundaries, draft edit/issue races, stock/transit/GL reconciliation and physical assembled returns without fictional component restocking.
- Real linked invoice page renders its original GP reference and both invoice/80mm print controls in local authenticated SSR; this uses synthetic identity/router fixtures, not a live provider session.
- Chromium: **6 Ctrl+P cases PASS** at mobile width, with no invalid navigation or browser errors; **48-line** Gate Pass A4/80mm **4/4 pages**, receiving A4/80mm **4/5 pages**, correct paper widths and no horizontal clipping. Physical printers remain unaccepted.
- TypeScript, Prisma validation and scoped lint passed locally. CI runs full app, finance, auth, desktop, Restaurant, PG18 upgrade/lifecycle and Chromium suites. Do not transfer old PASS labels to an untested head.

## Production safeguards and external blockers

Current project configuration: V1 enabled, exact workspace `4bc313cf-2869-4d87-8f1e-22a147f18d2d`; V2 issue-stock flag absent. BOM dispatch and the two legal-approval settings are also absent. No flags were changed. FBR being disabled is not legal permission for acceptance-based invoice timing; no approval reference was invented and no accounting/FBR guard was removed.

Production-wide business-data checksum comparison was **NOT EXECUTED**: automatic approval review rejected the all-table scan as exceeding narrow migration/route inspection and involving customer/financial records. No alternative execution path was used. Catalog/checksum-of-migration-files evidence does not certify customer-data reconciliation. Production records were never mutated by this work.

Existing recovery branches are retained, including `br-red-cloud-b3aimk53`. Ten branches were listed; no branch was removed/reset to free a slot. A current pre-operation recovery point must be verified separately; a 12 October backup must not silently be treated as a current recovery point.

Previously reported `PIPE-FF-HUB` shortage requires physical stock verification and an authorized real inventory receipt/correction. Never seed stock to make a test pass. Any BOM precision/valuation rejection must be corrected through valid source quantities/costs, not a weakened check.

## Private operator sequence — not executed against hosted databases

1. Review the PR's exact SHA and all required CI; use a clean private checkout of that reviewed SHA. Install locked dependencies **before** supplying secrets. Keep V2 disabled.
2. Supply DATABASE_URL from an owner-approved private secret source. Do not paste it into chat, command arguments, source, CI, artifacts or PR text. Vercel's existing Sensitive value cannot be read back; do not replace it merely to retrieve it.
3. In that private environment run `node --env-file <APPROVED_PRIVATE_ENV_FILE> scripts/assert-production-database-target.cjs`. Confirm the live deployment's connection maps to the project/branch/database above, rather than relying on the project display name. Repeat read-only Prisma status and successful checksum comparison; expected pending set is exactly the table above. Stop on drift or any active failed migration.
4. Arrange an owner-approved operation window and **fresh** restore point/snapshot. Verify identity, creation time/LSN and recovery feasibility. If branch capacity or snapshot entitlement blocks it, obtain the required capacity decision; never delete an existing backup or incur a paid upgrade implicitly.
5. Rehearse on an approved disposable branch before the live operation if required by the operator's policy. The local PG18 rehearsal already validates the exact SQL and unchanged synthetic legacy records; it does not claim a hosted branch rehearsal or managed restore acceptance.
6. After separate confirmation of the irreversible enum additions and all safety prerequisites, run exactly once, privately: `node --env-file <APPROVED_PRIVATE_ENV_FILE> node_modules/prisma/build/index.js migrate deploy`. Never reset, resolve or manually insert/update migration ledger records. On any failure STOP; preserve sanitized stage evidence and obtain a reviewed recovery plan before retrying.
7. Independently attest 136 successful migrations, their checksums, marker column/constraint, trigger function and two labels. Historical markers must remain NULL. Verify data only within the explicitly approved scope. Health must be 200; readiness must become 200/ready at the actual deployed SHA.
8. Review/approve deployment of this focused fix separately. Verify exact new SHA/READY, health/readiness and read-only routes. Obtain a dedicated isolated provider-authenticated acceptance session; never run experimental transactions on Ahmad's real records.
9. Only after database, CI, backward compatibility and controlled acceptance pass, approve the workspace-scoped V2 flag and separately applicable BOM flag. Deferred dispatch/final invoice still require genuine transaction-specific tax/legal approval/reference. If an invoice is required at delivery, use the existing standard Sales workflow; do not bypass the timing safeguards.
10. Monitor controlled real operations; no synthetic stock/payment/refund transactions in production. Rollback starts by disabling new issuance while retaining marker-aware code and additive schema: an already reserved GP must never be dispatched by pre-V2 code that would deduct again. Physical A4/80mm hardware acceptance remains a distinct owner task.

**Verdict:** technically prepared for review; the complete production GP-to-invoice workflow is **BLOCKED**, not certified operational.
