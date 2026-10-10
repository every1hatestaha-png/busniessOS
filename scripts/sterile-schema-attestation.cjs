/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { captureRegistry } = require("./restaurant-schema-registry.cjs");
const root = path.join(__dirname, "..");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function assertEmptyDatabase(client) {
  const state = (await client.query(`SELECT current_database() AS database,
    current_setting('server_version_num')::int / 10000 AS major, pg_is_in_recovery() AS recovering,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public') AS objects,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public') AS routines,
    (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public') AS types,
    (SELECT count(*)::int FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema')
      AND nspname NOT LIKE 'pg_%') AS extra_schemas`)).rows[0];
  if (!state || state.major !== 18 || state.recovering || state.objects || state.routines || state.types || state.extra_schemas) {
    throw new Error("Sterile preflight requires writable PostgreSQL 18 with no application objects.");
  }
  return state;
}

async function captureSchema(client) {
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  const registry = await captureRegistry(client, tables, { allPublicTables: true });
  const enums = (await client.query(`SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`)).rows;
  const routines = (await client.query(`SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`)).rows;
  const extra = (await client.query(`SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' AND c.relkind NOT IN ('r','p','i','I','S','t'))
      OR (n.nspname NOT IN ('public','pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%')
    ORDER BY n.nspname,c.relname`)).rows;
  if (extra.length) throw new Error("Unreviewed application relations outside the table registry.");
  return {
    tables: registry.map(r => ({ name: r.table_name, sha256: digest(r) })),
    enums: enums.map(r => ({ name: r.name, sha256: digest(r.values) })),
    routines: routines.map(r => ({ name: r.name, arguments: r.arguments, sha256: digest(r.definition.replaceAll("\r\n", "\n")) })),
  };
}

function assertSchemaMatches(actual, expected) {
  if (actual.tables.length !== 74 || !isDeepStrictEqual(actual, expected)) {
    throw new Error("Sterile schema fingerprint mismatch; no Preview is authorized.");
  }
}

async function assertSterileSchema(client) {
  const expected = JSON.parse(fs.readFileSync(path.join(root, "config/sterile-schema-fingerprint.json"), "utf8"));
  const actual = await captureSchema(client);
  assertSchemaMatches(actual, expected);
  // The migration seeds exactly three global plan definitions, not tenant data.
  const plans = (await client.query('SELECT id, code, name, "billingInterval", "pricePkr", "maxUsers", "isActive" FROM saas_plans ORDER BY code')).rows;
  const expectedPlans = [
    { id: "plan_business", code: "business", name: "Business", billingInterval: "MONTHLY", pricePkr: null, maxUsers: 10, isActive: true },
    { id: "plan_pro", code: "pro", name: "Pro", billingInterval: "MONTHLY", pricePkr: null, maxUsers: null, isActive: true },
    { id: "plan_starter", code: "starter", name: "Starter", billingInterval: "MONTHLY", pricePkr: null, maxUsers: 3, isActive: true },
  ];
  if (!isDeepStrictEqual(plans, expectedPlans)) throw new Error("Unexpected migration-seeded plan definitions.");
  // Check EVERY other application table, without selecting private row values.
  for (const table of actual.tables) {
    if (["_prisma_migrations", "saas_plans"].includes(table.name)) continue;
    if (!/^[a-z0-9_]+$/.test(table.name)) throw new Error("Unreviewed relation name.");
    if ((await client.query(`SELECT EXISTS (SELECT 1 FROM public."${table.name}" LIMIT 1) AS populated`)).rows[0].populated) {
      throw new Error("Sterile application tables contain data; stop before Preview.");
    }
  }
  return { tables: 74, emptyApplicationTables: 72, migrationSeededPlans: 3, schemaSha256: digest(actual) };
}

module.exports = { assertEmptyDatabase, captureSchema, assertSchemaMatches, assertSterileSchema };
