# ADR: Restaurant SQL ownership and drift certification

Status: accepted for this release candidate.

Restaurant is a vertical in the main MunshiOS application. Its staging project
is a deployment target, not a separate application or schema architecture.

The Restaurant tables (including recipes, KOT and shifts) remain SQL-owned.
Prisma migrations are the sole ordered schema history, while parameterized SQL
services implement tenant-scoped locking, posting and state transitions. Existing
database constraints and triggers protect actor attribution, immutable financial
evidence, parent tenant tuples, stock conservation and exactly-once posting.
Prisma models continue owning the shared workspace, user, inventory and finance
tables. Adding Restaurant Prisma models now risks divergent ownership and loss of
database invariants, without a demonstrated product benefit.

The reviewed `restaurant-schema-registry.json` records columns, defaults,
constraints, indexes, triggers and hashes of their function definitions across
18 SQL-owned tables. `scripts/restaurant-schema-registry.cjs` discovers relation
names from migrations, rejects dual Prisma ownership, and compares a freshly
migrated disposable database with that contract inside a read-only transaction.
It also rejects unexpected/missing Restaurant relations and unvalidated or invalid
constraint/index changes. CI never introspects a managed production/staging DB.

Schema changes require an additive migration, review of the registry delta and
re-running migration/integrity certification. The checker cannot rewrite its own
expected registry. To review a deliberate update, capture the catalog using the
exported `captureRegistry` helper against a new disposable, fully migrated DB;
inspect the diff before committing. Trigger hashes refer to each attached function
body; existing integrity tests cover helper functions called by those bodies.

This registry is a drift gate, not a substitute for financial/tenant/race tests.
Any future conversion needs a new ADR and explicit preservation tests; this batch
does not convert tables or alter existing Restaurant migrations.
