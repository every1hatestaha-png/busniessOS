/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Client } = require("pg");
const { isDeepStrictEqual } = require("node:util");

const registryPath = path.join(__dirname, "../docs/architecture/restaurant-schema-registry.json");
const isRestaurantTable = name => name.startsWith("restaurant_") || ["recipes", "recipe_items", "kitchen_tickets", "cash_shifts"].includes(name);

function discoverTables(root) {
  const tables = new Set();
  for (const migration of fs.readdirSync(path.join(root, "prisma/migrations")).sort()) {
    const file = path.join(root, "prisma/migrations", migration, "migration.sql");
    if (!fs.existsSync(file)) continue;
    for (const match of fs.readFileSync(file, "utf8").matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([a-z0-9_]+)"/gi)) {
      if (isRestaurantTable(match[1])) tables.add(match[1]);
    }
  }
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  for (const match of schema.matchAll(/@@map\("([a-z0-9_]+)"\)/g)) {
    if (tables.has(match[1])) throw new Error(`Dual SQL/Prisma ownership requires an approved ADR: ${match[1]}`);
  }
  return [...tables].sort();
}

async function captureRegistry(client, tables) {
  const actual = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows
    .map(row => row.tablename).filter(isRestaurantTable);
  if (JSON.stringify(actual) !== JSON.stringify(tables)) throw new Error("Restaurant relation inventory drift");
  const rows = await client.query(`
    SELECT c.relname AS table_name,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
        'notNullValidated',COALESCE((SELECT bool_and(nc.convalidated) FROM pg_constraint nc
          WHERE nc.conrelid=a.attrelid AND nc.contype='n' AND a.attnum=ANY(nc.conkey)),true),
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
        ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype<>'n'),'[]') AS constraints,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid)
        ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),'[]') AS indexes,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,
        'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]') AS triggers
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname
  `, [tables]);
  // pg returns jsonb keys in a stable order. Hash bodies to keep the reviewed
  // registry compact; columns and constraint/index definitions remain visible.
  return rows.rows.map(row => ({ ...row, triggers: row.triggers.map(trigger => ({
    ...trigger, function: createHash("sha256").update(trigger.function.replaceAll("\r\n", "\n")).digest("hex"),
  })) }));
}

async function checkRegistry(connectionString) {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/munshios_round3(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
    throw new Error("Registry certification is restricted to disposable loopback munshios_round3 databases.");
  }
  const expected = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const tables = discoverTables(path.join(__dirname, ".."));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actual = await captureRegistry(client, tables);
    if (!isDeepStrictEqual(actual, expected)) {
      const changes = [];
      for (let i=0; i<Math.max(actual.length,expected.length); i++) {
        const current = actual[i], prior = expected[i];
        for (const key of ["table_name", "columns", "constraints", "indexes", "triggers"]) {
          if (!isDeepStrictEqual(current?.[key],prior?.[key])) changes.push(`${current?.table_name ?? prior?.table_name}.${key}: expected ${JSON.stringify(prior?.[key])}; actual ${JSON.stringify(current?.[key])}`);
        }
      }
      throw new Error(`Restaurant schema registry drift:\n${changes.join("\n")}`);
    }
    console.log(`Restaurant registry PASS: ${tables.length} SQL-owned tables; read-only catalog inspection.`);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}
module.exports = { discoverTables, captureRegistry, checkRegistry };
if (require.main === module) checkRegistry(process.env.DATABASE_URL).catch(error => { console.error(error.message); process.exitCode = 1; });
