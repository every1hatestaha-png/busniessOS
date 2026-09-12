# MunshiOS RC1 Validation Ledger

This file records the automated release-candidate gates while MunshiOS is hardened for controlled beta.

## Automated gate

The `RC1 Finance Gate` workflow runs against a clean PostgreSQL 16 database and requires all of the following:

- Prisma schema validation
- all database migrations from zero
- TypeScript (`tsc --noEmit`)
- full unit + integration suite
- dedicated finance-grade scenario suite
- ESLint for app/components/lib
- production runtime dependency audit
- Windows desktop smoke tests

## Current result — 2026-09-12

GitHub Actions run `34677546173` on commit `7f4f0a1d8cf4005dfd1b4a16633d46f6ec7d0efe` completed successfully.

- Prisma validate: PASS
- migrations from zero: PASS (18 migrations)
- TypeScript: PASS
- regular unit + integration suite: **359 / 359 PASS**
- finance-grade scenario suite: **48 / 48 PASS**
- ESLint: PASS
- isolated shipped-runtime dependency audit: PASS
- Windows desktop smoke: PASS

The finance-grade suite now runs as a mandatory RC1 gate through `vitest.finance.config.mts`. A small test-only harness normalizer corrects legacy fixture/oracle assumptions that had drifted from current service contracts (customer creation return type, UUID idempotency fixture format, opening balance/stock baselines, and a stale partial-PO status expectation). It does not transform or relax application/runtime code.

## Covered hardening scope

Automated scenarios cover sales and per-unit discounts, customer credit days and limits, customer receipts and reversals, purchase orders, weighted GRNs, supplier returns, supplier payments and WHT, expenses, inventory valuation and movements, AR/AP, GL balancing, P&L/report reconciliation, workspace isolation, idempotency/double-submit behavior, lifecycle reversals, precision edge cases, and desktop smoke behavior.

## Production deployment check

The matching production deployment for commit `7f4f0a1d8cf4005dfd1b4a16633d46f6ec7d0efe` is Vercel `READY` (`dpl_CzEb4js45wZb4CxcjrmBtEEKEjHy`).

The web root was also hardened so a fresh signed-out visit no longer falls into a Clerk development-browser 404. The root now resolves successfully and redirects signed-out visitors into the MunshiOS sign-in route, while dashboard/application routes remain protected.

At the time of validation, production runtime log inspection showed no error/fatal entries in the checked recent window.

## Remaining release gate

Automated/code-side RC1 validation is green. The remaining release requirement is authenticated human/browser QA that cannot be proven by CI:

- live end-to-end authenticated workflows using QA-only records
- actual PDF/print visual inspection (invoice, PO, GRN, receipts/vouchers/statements)
- responsive visual QA at desktop/tablet/mobile widths
- final live reconciliation after those QA flows

These should be completed with Astra or equivalent browser control when available. Until those visual/live checks pass, the correct release status is **TECHNICALLY GREEN / MANUAL RC1 QA PENDING**, not final controlled-beta approval.
