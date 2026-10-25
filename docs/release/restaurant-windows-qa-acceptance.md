# MunshiOS Restaurant Windows QA acceptance

Status: NOT RELEASE CERTIFIED. This runbook is for internal QA of a single exact Windows artifact.

## Before installation

1. Record the GitHub run URL, artifact name, source commit, SHA256SUMS.txt, and QA-READ-ME.txt.
2. Verify the downloaded .exe SHA-256 matches SHA256SUMS.txt using Windows PowerShell:
   `(Get-FileHash -Algorithm SHA256 -LiteralPath "PATH_TO_INSTALLER.exe").Hash.ToLowerInvariant()`
3. Use a non-production Restaurant staging URL and an isolated paid staging workspace containing only synthetic transactions. Do not test with Ahmad/Arshad Sons production records.
4. Note Windows version, installer file name, source SHA, QA user accounts by non-secret test identifier, and 80mm printer model.
5. The QA installer is unsigned. Do not distribute it to customers. Do not use or alter the manufacturing production installer.

## Acceptance checklist

Record PASS, FAIL, or BLOCKED for each step and attach redacted screenshots/logs.

| ID | Operator / test | Required observed result | Result / evidence |
| --- | --- | --- | --- |
| W01 | Install and launch the QA app | Separate MunshiOS Restaurant QA identity and user profile; production app unaffected | PENDING |
| W02 | Owner sign-in and logout | Real hosted authentication succeeds; logout invalidates desktop session; reopening does not expose previous tenant | PENDING |
| W03 | Cashier staff sign-in | Assigned CASHIER can access POS/orders; kitchen mutation and manager financial pages denied | PENDING |
| W04 | Kitchen staff sign-in | Assigned KITCHEN can access queue; cashier settlement and manager permissions denied | PENDING |
| W05 | Manager assignment | Authorized manager can assign stations; unauthorized staff cannot | PENDING |
| W06 | Cross-tenant attempt | Authenticated staff cannot read or mutate another staging workspace | PENDING |
| W07 | Order and KOT | Cashier creates one order with item note; kitchen receives exactly one matching KOT | PENDING |
| W08 | Kitchen lifecycle | Kitchen moves CONFIRMED to PREPARING to READY; cashier sees READY after refresh | PENDING |
| W09 | Payment and completion | Cashier settles through authorized flow; balances, receipt and daily completion-based manager sales agree | PENDING |
| W10 | Duplicate/retry | Repeated identical request does not duplicate order, payment, inventory movement or GL posting | PENDING |
| W11 | Session interruption | Restart, expired session and lost network recover safely without unauthorized data or double posting | PENDING |
| W12 | 80mm KOT physical print | Correct printer, item notes, width, Urdu/Unicode if relevant, paper feed and cutter | PENDING |
| W13 | 80mm receipt physical print | Correct printer, taxes/totals, long order, margins, cutter and reprint behavior | PENDING |
| W14 | Printer unavailable | Preview/fallback remains usable; offline/paper-out handled without mutation | PENDING |
| W15 | Safety and regression | No production data touched; manufacturing workflow and normal installer remain unchanged | PENDING |

## Additional live concurrency acceptance

Run two authenticated tabs/sessions against one synthetic staging order. Exercise simultaneous completion/payment or competing terminal actions. Confirm exactly-once posting, a balanced GL, and a safe rejected/replayed loser request. Record server-side evidence and transaction identifiers without credentials.

## Sign-off evidence

- QA artifact run and source SHA:
- Installer SHA-256:
- Hosted staging revision and environment:
- Windows version and printer model:
- Operator names or non-secret test IDs:
- Failed/blocked tests and GitHub issues:
- Screenshots or redacted traces:
- Operator approval and date:

Production promotion stays blocked until verified hosted deployment, live authentication/authorization, physical printer acceptance, and operator sign-off. Automated smoke tests alone do not establish these results.
