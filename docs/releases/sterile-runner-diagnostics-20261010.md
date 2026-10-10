# Sterile runner failure diagnosis

Base: draft #319, `acea860ca24cc68ce6aea8589b802ed3ea25a369`. This stacked change does not alter that approved commit. **The new HEAD needs review and explicit owner authorization before ANY hosted attempt.** No hosted operation was executed for this change.

## Evidence and root-cause limits

The operator reports successful URL/private-checkout/connectivity/empty-schema checks and independently confirms zero public objects/no migration ledger after the original generic failure. Those are operator observations, not a new agent-run hosted migration. An absent ledger does not identify the failed subprocess operation or authorize retry.

The original runner hides spawn errors, timeout, engine nonzero exit, lock/attestation/cleanup failures behind one message. `spawnSync` also blocks the Node event loop and has a default output-buffer limit. A controlled Windows child producing 2 MiB reproduces `ENOBUFS`; the streamed replacement drains that child successfully without retaining or printing its output. This demonstrates a runner weakness, **not** that the real hosted Prisma output exceeded the limit.

A fresh disposable LOCAL PG18 restricted-role fixture passes connectivity, advisory lock and empty-schema checks, then fails `migrate deploy` before creating the ledger. Read-only preflight success therefore does not prove schema-creation privileges. This reproduces another possible failure class, **not** the credentials/privileges used by the operator.

The actual hosted cause is **NOT REPRODUCED/UNKNOWN**. In particular, starting the Prisma CLI and receiving exit 1 from `migrate status` on an empty database do not establish that `migrate deploy` can connect/create schema. The runner never calls `migrate status`; all nonzero deploy exits fail closed.

## Structured diagnostic contract

One JSON FAIL goes to stderr; exit code is 1. Stage/reason/systemCode/prismaCode are fixed classifications; exitCode/signal/elapsedMs are bounded metadata. No exception messages/stacks, URLs/passwords, SQL, arbitrary provider strings, stdout/stderr, paths or raw engine logs are emitted. Only anchored, allowlisted `Error: Pxxxx` tokens are retained from transient child chunks; ANSI/nonstandard output may leave the engine code unclassified. Never share raw logs to compensate.

| Stage | What needs private operator verification |
| --- | --- |
| `local_validation` | Explicit approval/target; exact new approved SHA; clean checkout; no dotenv/diagnostic overrides; pinned CLI/catalog |
| `db_connection` | Driver initialization, verified TLS, connectivity and exact database identity |
| `advisory_lock` | Another operator, lock-query privilege/connection failure, or owning session lost while child runs |
| `empty_schema` | Writable PG18 and zero public objects/routines/types/extra schemas |
| `migration_catalog` | File availability and unchanged raw migration bytes |
| `prisma_subprocess` | `launch_failed`, `timeout`, `output_limit`, `output_stream_failed`, `cancelled` or `nonzero_exit`; allowlisted engine code where present |
| `post_migration_attestation` | `snapshot_failed`, `ledger_or_checksum_failed` or `schema_or_seed_data_failed` |
| `cleanup` | Failure releasing lock, rolling back a read-only snapshot, or closing the connection |

`cleanupFailed:true` augments an existing primary failure instead of replacing it. PASS is emitted only after required attestation and successful cleanup.

Useful fixed classifications: `ENOENT` missing executable, `EACCES`/`EPERM` local permission, `ETIMEDOUT` timeout, `ENOBUFS` legacy output cap; `P1000` authentication, `P1001` reachability, `P1002` connection timeout, `P1010` database access, `P1011` TLS, `P1012` configuration, `P3005` nonempty database, `P3018` migration execution. Codes identify a class, not the complete cause.

## Windows and timeout handling

Run the pinned installed CLI via the exact Node executable and argv, with `shell:false`/`windowsHide:true`; paths containing spaces are tested. Do not invoke npm.cmd/npx, interpolate a URL into command arguments, enable debug tracing or change TLS protections. The asynchronous child drains both streams with bounded per-stream tails and a 16 MiB total-output stop; it keeps the pg event loop responsive.

The existing 180-second migration deadline is preserved. Timeout/output-limit/session loss requests termination of the direct CLI; killed-CLI completion does not wait indefinitely for inherited descendant pipes. This is **not** proof that every Prisma engine descendant stopped. Failure diagnostics require private active-process/session verification; termination failure is flagged. No child retry, auto-reset, down migration, resolve, ledger edit or provider change is performed. Primary failure remains visible even if cleanup also fails. Stop on failure and obtain separate recovery/attempt authorization.

## Validation scope

Exact new-head local/CI evidence is recorded in the draft PR. Focused diagnostics/target guards, real direct-Node subprocess cases, TypeScript/lint and the updated disposable PG18 rehearsal run. The successful local fixture independently verifies 132 successful unique migrations, SHA-256 checksums/order, 74-table schema fingerprint, 72 empty application tables and exactly three reviewed global SaaS plans; no tenant data. Rerun/concurrent-operator/drift protections remain tested. The restricted-role negative fixture remains empty, without a ledger.

The Prisma schema, 132 migration files, expected schema fingerprint, application, finance/auth code and dependency lock are unchanged from #319. Its exact-head workflow `38029420230` is reused as **base-SHA** evidence for unchanged full application/invariant/build behavior; it is not mislabeled as full new-head certification. Automatic deployment is disabled for the new branch before push.

## Next hosted boundary

Review the new draft HEAD and authorize that exact SHA separately. Then follow `sterile-staging-private-operation-20261010.md` in a clean trusted private terminal, revalidating the provider identity and emptiness. Preserve only the structured sanitized result. If it fails, STOP and report the exact stage/reason/allowlisted code. Further diagnosis is private and read-only; no automatic retry or recovery is allowed. Vercel, Supabase, deployment, production and FBR remain excluded.
