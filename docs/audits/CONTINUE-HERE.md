# MunshiOS continuation checkpoint

Repository: every1hatestaha-png/busniessOS
Production: https://www.munshios.tech
Branch: fix/production-audit-20260925
Base: 0dacea2 (origin/main at checkout). Code commits: 2ec37bf, a115543, 4e428eb.

## Current state

Read 2026-09-25-production-audit.md for evidence, severity, reproduction, remediation and complete coverage checklist. The audit is PARTIAL. Fixes are committed locally, NOT confirmed pushed or deployed. Automatic approval review rejected GitHub publication because explicit destination permission was not established. Do not work around that block. Obtain explicit permission to push this branch to the repository and create a PR before retrying. Never claim local fixes are live.

349 unit tests passed. Main fix set passed optimized production build, TypeScript and changed-file lint. Follow-up customer advance availability and label changes passed TypeScript and lint. No isolated database integration test or deployed retest was completed. No migration included.

## Recovery from attached archive

Archive includes this handoff, full audit report and munshios-audit-fixes.patch. Patch contains ONLY changes after the base commit, with commit metadata. It contains no node_modules, .env files, credentials or customer data dumps.

In a clean checkout, inspect AGENTS.md, current branch and working tree. Determine whether these commits/changes are already present before applying anything. If the branch is absent and changes are missing, create an isolated branch at base 0dacea2 and use git am with the patch. Preserve unrelated work. Then reconcile with current origin/main, which may have advanced. Never reset main or force-push.

## Work loop for any capable normal chat

1. Read this file and full report once. Inspect current repository and deployment state.
2. Pick the highest-severity unresolved issue with a reproducible case.
3. Reproduce using only disposable test fixtures, inspect source, apply the smallest fix.
4. Run a meaningful regression test and relevant type/lint/build gates. Use an isolated test database for integration tests, never the production database.
5. Update report status: observed, patched, unit-tested, deployed, production-retested. Preserve evidence and mark untested explicitly.
6. Commit a coherent change, publish a reviewable branch/PR when authorized, and deploy only through authorized connected capabilities.
7. Retest deployed behavior in the dedicated test workspace. Record exact commit, deployment URL and test outcome.
8. Keep this checkpoint current so the next chat resumes instead of repeating the audit.

Normal chat requires repository editing/execution and authenticated browser/deployment access to perform these actions. If those capabilities are absent, produce a concrete patch/handoff and state what was not executed. Chat memory alone does not transfer unpushed code. Never pretend to deploy or test.

## Next actions in order

- Explicit repository publication permission, then push branch and create PR. Check current main for conflicts and deployment checks.
- Deploy/retest P&L return reversal classification. Same period and prior period must preserve net GL revenue while avoiding fake gross sales.
- Verify warehouse creation after removing non-async export from use-server module, then BOM consumption, fractions, original warehouse and reversals.
- Retest product edits with absent optional fields and server rejection of archived stock adjustments.
- Retest fractional returns, decimal discounts/receipts, advances above debt AND zero-balance customer advances, with GL/stock reconciliation.
- Complete tenant and role testing using a second explicitly authorized dummy tenant and lower-role test sessions. Do not enumerate real tenant IDs. Stop if real tenant data appears.
- Configure production Clerk only with legitimate supplied configuration. Do not invent credentials or move accounts blindly.
- Tighten CSP only after inventorying actual script/auth requirements and verifying flows.
- Resolve same-day ledger display ordering consistently without rewriting historical postings.
- Complete actual A4/thermal print output, logo, mobile widths, uploads, API input validation and safe concurrency testing.

## Safety and credentials

Only supplied test account and disposable Crust workspace may be mutated. No real customer data, brute force, high traffic or infrastructure attacks. Do not expose secrets, cookies or tokens. Do not send external invitations/emails without explicit authorization. Full signup/reset, tenant/RBAC and print coverage remain unverified.

## Compact continuation prompt

Continue MunshiOS from the attached checkpoint and patch. Read CONTINUE-HERE.md and the audit report. Restore missing commits safely, inspect current main, and work through unresolved issues in severity order. Reuse completed evidence. Fix, test, commit and update the checkpoint after each coherent change. Distinguish local, deployed and live-retested results. Use only the authorized dummy workspace. Preserve all safety boundaries and publication approval requirements. Ask only for genuinely missing access or credentials.
