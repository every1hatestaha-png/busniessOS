# Sterile Neon cloud migration — manual-only review candidate

**Status:** Draft only. Nothing has been migrated on the real Neon target, no GitHub environment/secret has been configured by this PR, and no label has been applied. This is a way to avoid further operator PowerShell failures, NOT execution approval.

## Event and secret gates
- Same-repo owner manually applies exact label `db-<40-character-reviewed-PR-HEAD-SHA>` to the new draft PR only after reviewing that SHA and obtaining explicit one-attempt approval for **only** Neon project `still-hill-08070011`, branch `br-calm-unit-b4hiv86y`, DB `neondb`.
- Hosted job is triggered only on the *labeled* PR event, not PR opening, pushing, retries or scheduled events. Runner verifies GitHub event payload, sender, fixed branch/base, exact checkout, matching SHA/label, and `GITHUB_RUN_ATTEMPT=1`. A deliberate second label event would be a **new attempt requiring new authorization**; never re-label or rerun after FAIL.
- Requires GitHub **Environment `sterile-neon-rc132`**, ideally with a required reviewer, environment-protected branch rules and environment-scoped secret `STERILE_NEON_DATABASE_URL` set by the owner using GitHub UI; keep it out of PR comments, labels, workflow inputs and artifacts. The secret is not in this repository. Prefer a dedicated restricted Neon role allowed on the new empty branch only. Secrets in GitHub-hosted workflows carry residual exfiltration risk from workflow code; review exact SHA and permissions before adding anything. If environment/reviewer protection is unavailable, STOP and choose another trusted operator path.
- Runner uses existing strict direct Neon hostname/project/branch/URL option validation, immutable checkout, migration catalog SHA, empty PG18 schema, advisory lock, exactly-once Prisma migrate deploy, strict 132 checksums, 74-table fingerprint, 3 global plans/zero customer data, no auto-retry/reset. Original #321 private Windows runner and `CI` refusal are unchanged. The cloud wrapper permits the established strict target validator ONLY after a second independent PR-label/GitHub context gate.
- Existing Prisma subprocess masks raw stdout/stderr and errors. Cloud wrapper emits bounded PASS or structured FAIL without credentials.
- No production, Vercel, Supabase, main branch, FBR, user data, other Neon project or default production branch touched.
- No changes to schema, 132 Prisma migration files, expected schema fingerprint or dependencies. Refer to #321's PG18 rehearsal and exact SHA #321 verification as base evidence, not a new-head full certification.

## Review then operation (NOT YET APPROVED)
1. Review the new draft PR and exact SHA; verify offline PR guard CI PASS.
2. Verify Environment reviewer and restricted deployment branch protection are available; set ONLY that environment-scoped Neon direct connection secret in GitHub Settings. No plaintext in a chat, workflow input, PR, or GitHub comment.
3. Independently confirm Neon target empty with no other active migrations.
4. Request explicit approval for the exact new SHA and one cloud attempt. Apply approval label matching the exact SHA. Do not label until then.
5. Read sanitized PASS/FAIL from the workflow. On any FAIL STOP; read-only Neon check; no re-label, GitHub run rerun, rollback, schema edit or second attempt.
6. Only after PASS and independent Neon audit can a new approval cover Preview env/deploy.

## Limits
Environment protection and GitHub UI secret setup are **not** completed by this PR. GitHub PR workflow restrictions vary by repository policy; if required reviewer or environment-scoped secret is not supported, the hosted path is blocked rather than silently degrading to a repository-wide secret or accepting free-form URL as an input. GitHub Actions usage may incur plan charges.
