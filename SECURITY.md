# Security Policy

MunshiOS handles business, financial, inventory and operational data. Security reports should be treated as confidential until a fix is available.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, customer data or reproduction material that could expose a live workspace.

Report privately to the MunshiOS maintainers through an existing private project/support channel. If GitHub private vulnerability reporting is enabled for this repository, that is also an appropriate channel.

Include, where possible:

- affected URL, module or commit
- impact and required privileges
- clear reproduction steps using synthetic data
- whether the issue crosses a workspace/tenant boundary
- whether secrets, authentication, payments, accounting, FBR data or customer records are exposed
- any safe mitigation already identified

Never include production credentials or real customer data in a report.

## Severity priorities

P0 / Critical:
- cross-tenant data access or mutation
- authentication bypass or account takeover
- exposed production secrets or signing credentials
- arbitrary server execution
- destructive financial or inventory corruption without an authorized workflow

P1 / High:
- privilege escalation inside a workspace
- payment, ledger, tax or inventory integrity bypass
- stored XSS or sensitive-data exposure
- recovery/session defects that can be exploited by another user
- exploitable dependency vulnerability in the production runtime

P2 / Medium:
- limited information exposure
- abuse or denial-of-service requiring meaningful preconditions
- security-control gaps with no demonstrated data/integrity impact

## Handling rules

1. Reproduce only in local or approved staging environments.
2. Do not touch production data to prove an issue.
3. Preserve tenant isolation, audit history and financial invariants while fixing.
4. Add a regression test for every confirmed security defect where practical.
5. Rotate affected credentials when exposure cannot be ruled out.
6. Revoke or invalidate affected sessions when account/session compromise cannot be ruled out.
7. Review logs for the exposure window and document customer-notification decisions.
8. Keep the fix in a guarded branch until tests, build and staging checks pass.

## Dependency policy

Production dependencies must pass the repository production audit gate. Known vulnerabilities that exist only in development/build tooling may be temporarily contained only when the dependency path is explicitly verified as dev-only and a production audit still passes. Exceptions must be removed when a compatible fix becomes available.

## Supported version

Only the currently deployed production release is supported for security fixes.
