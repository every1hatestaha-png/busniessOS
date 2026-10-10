# Sterile migration failure-stage reporting (draft / not approved for hosted execution)

Why: the Windows operator saw only a generic failure, despite read-only Neon confirming **0 tables and no migration ledger**. The separate connection test reached the verified empty Neon database and the local Prisma CLI starts, so the failure lies in an as-yet-unknown runner stage. Never infer that a migration was applied from a local error.

This change **only** reports a constant-valued stage identifier on failure. It does **not** print error messages, database URLs, Prisma stdout/stderr, user records or secrets. It does not alter migration order, connection target, URL/TLS validation, empty-schema check, tenant isolation, SHA lock, advisory lock, checksum verification, timeout or release permission. Unit tests inject a fake Prisma failure containing a simulated secret to prove stage labels contain no secret content. It is a **draft PR stacked on #319**, not the previously authorized SHA.

### Offline validation and next operator gate
1. Verify exact changed files, run dedicated unit tests, ensure full original #319 migration rehearsal evidence remains valid.
2. A failure stage such as `PRISMA_MIGRATE_DEPLOY` still does **not** tell the precise Prisma error; review privately with suitably redacted local logs and do not copy raw provider URLs anywhere.
3. Hosted database migrations must **not** be retried using this branch or any other version without separately reviewing the stage and reconfirming owner approval for a new exact SHA.
4. The original sterile Neon project remains unmigrated as of the last verified read-only check. Do not change Vercel settings or deploy.
