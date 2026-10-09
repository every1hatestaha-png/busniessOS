# Dependency / marketing convergence

## Provenance and scope

- Foundation: PR #313, `2b3ebc2ad6fc0248511961640ea15de32a01ddf3`, based on main `f369e3549a1ef6b2fbb00a58a1534bdfe35472da`. All four exact-commit workflows succeeded (runs 37882306273, 37882306212, 37882306181, 37882306154).
- Marketing source: PR #309, `91584de9ac8a05b83902e2d95cd2bc699fba85dd`, with the same merge base. Its 26 unique commits were cherry-picked without conflicts, preserving authorship. Its application/component/library changes are unchanged by this integration.
- PR #309's finance/security run failed on one outdated literal signup navigation assertion; 1,190 tests passed in that historical run. Its audit and print failures were already fixed by #313. Historical results are provenance, not certification of this candidate.
- The dependency manifest/lock, audit containment script, Restaurant browser correction and Prisma migration directory remain byte-identical to #313. No dependency exceptions or application authorization controls were relaxed.
- PRs #306–#308 and #312 remain separate. #312 (`9cc26b34e4f5baa3e5e360dbf182acb94c02ad39`) depends on #308 (`20b876edbf08314f4760692d33ff978bd8b7a0f9`); importing it alone would omit its prerequisite Preview migration guard. That security stack is deliberately excluded and requires separate convergence/review before release.

## Behavior and regression coverage

Signup still verifies Supabase email OTP. Session-bearing results go through the canonical post-login resolver. Builder inputs retain only recognized business, modules and billing; they cannot supply a role, tenant or arbitrary destination. The server checks a confirmed session and scopes membership resolution to its local identity before routing. New users can retain sanitized onboarding preferences; existing users retain their membership and active workspace cookie.

Tests exercise actual signup submit/OTP handlers for all five business types, immediate/no-session outcomes, hostile destinations and failed verification. Callback and post-login tests cover provider exchange, missing confirmation, forged tenant preferences and onboarding path bypasses. Rendered marketing tests cover all five choices, desktop industries, the mobile industries index, footer/legal links and published prices. These are automated render/event tests, not live browser or inbox acceptance.

Focused local checks: 98 auth/onboarding/build-guard tests and four rendered marketing tests passed. A new disposable PostgreSQL cluster bound to `127.0.0.1:55447`, database `marketing_convergence`, accepted all 129 unchanged migrations. Local logs are saved under the task workspace's `outputs/marketing-convergence-20261009/`; the draft PR records final broader/CI results and its exact HEAD.

Automatic Vercel Git deployments are disabled for `integrate/dependency-marketing-onboarding-20261009` before any push. Four existing read-only CI workflows now accept the #313 base branch and check out the PR's exact head. No cloud resources, hosted data, provider settings, subscriptions, production workflows or deployment targets were changed.

## Remaining release acceptance

- Separate security-stack and migration-guard convergence remains required; this PR does not claim the whole platform is release-certified.
- Real desktop/mobile interaction and email inbox acceptance require independent evidence. Physical printer acceptance also remains external; the unchanged print harness is verified by CI, not physical hardware.
- #313's three documented development-only advisory exceptions remain; the production audit must stay clean.
- Owner approval is still required for any merge or deployment. This work performs neither.
