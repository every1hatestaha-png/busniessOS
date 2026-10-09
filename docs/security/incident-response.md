# MunshiOS Incident Response Runbook

This runbook is for suspected compromise, tenant isolation defects, credential exposure, auth/session failures, or integrity incidents affecting financial, inventory, restaurant, manufacturing or compliance data.

## 1. Declare and preserve evidence

- Record detection time, reporter, affected environment and suspected scope.
- Freeze non-essential production changes.
- Preserve relevant Vercel, Supabase/Auth, database and application logs.
- Do not paste secrets, tokens or customer records into tickets or chat transcripts.
- Create a private incident record with a timeline and owners.

## 2. Classify impact

Treat as critical until disproved when the incident may involve:

- another workspace's data
- account takeover or auth bypass
- administrator/owner privilege escalation
- production secrets
- FBR credentials or transmission data
- payment, ledger, stock or immutable-history corruption
- arbitrary code execution

Identify the earliest plausible exposure time and all affected workspaces/users.

## 3. Contain

Choose the smallest safe containment that stops ongoing risk:

- revoke affected sessions or users
- disable a compromised integration
- rotate exposed Vercel/Supabase/database/FBR/provider secrets
- block an abusive route or origin
- temporarily disable the vulnerable feature
- switch a high-risk workflow to read-only if integrity is uncertain

Do not delete audit, payment, ledger, invoice, refund, return or FBR evidence to hide the incident.

## 4. Eradicate and fix

- Reproduce in approved staging using synthetic data.
- Fix the root cause, not only the visible symptom.
- Add a regression test that demonstrates the prior failure.
- Re-run auth, tenant, finance, inventory and relevant vertical gates.
- Run production dependency audit.
- Run Supabase security advisors after schema/RLS changes.
- Verify security headers and auth routes use no-store where sessions may be refreshed.

## 5. Recover

Before restoring normal operation:

- verify database/readiness checks
- verify login, logout, recovery and role changes
- verify tenant isolation with at least two synthetic workspaces
- verify financial/inventory reconciliation if those domains were affected
- verify no new runtime errors
- confirm rotated credentials are active and old credentials are unusable
- ensure backups/restore points remain available

## 6. Notification decision

Document whether affected customers, partners or authorities require notice based on:

- what data or credentials were exposed
- whether unauthorized access is confirmed or reasonably likely
- duration and number of affected users/workspaces
- contractual or legal obligations
- whether tax/FBR or other regulated records were involved

Use precise facts. Do not claim there was no access merely because logs are incomplete.

## 7. Post-incident

Within the private incident record capture:

- root cause
- blast radius
- containment and recovery times
- credentials/sessions rotated
- tests and controls added
- monitoring gaps
- owner and due date for every remaining action

No production merge should rely only on a written review; required automated gates and staging verification must also pass.
