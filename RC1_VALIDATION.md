# MunshiOS RC1 Validation Ledger

This file records the automated release-candidate finance gates while MunshiOS is hardened for controlled beta.

## Automated gate

The `RC1 Finance Gate` workflow runs against a clean PostgreSQL 16 database and must pass all of the following before RC1 can be considered technically green:

- Prisma schema validation
- all database migrations from zero
- TypeScript (`tsc --noEmit`)
- full unit + integration suite
- ESLint for app/components/lib
- production dependency audit
- Windows desktop smoke tests

## Current hardening scope

The automated scenarios cover sales and per-unit discounts, customer credit days and limits, customer receipts and reversals, purchase orders, weighted GRNs, supplier returns, supplier payments and WHT, expenses, inventory valuation and movements, AR/AP, GL balancing, P&L/report reconciliation, workspace isolation, idempotency, lifecycle reversals, and desktop smoke behavior.

The most recent completed full suite before this ledger was created reached **352 / 359 tests passing**. The remaining seven failures were traced to stale test expectations/fixtures rather than a relaxation of finance rules: per-unit discount expectations, missing explicit weighted-GRN receipt facts, dashboard public-field naming, and sub-rupee WAC rounding caused by the persisted two-decimal product cost field. Those fixtures have now been corrected and a clean full rerun is required.

## Release rule

A green automated gate does **not** by itself mark MunshiOS released. Real authenticated browser workflow checks and human visual inspection of dedicated print PDFs remain separate release requirements.
