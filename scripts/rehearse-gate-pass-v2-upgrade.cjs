/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable loopback PostgreSQL18 ONLY. Never accepts a hosted connection.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {createHash,randomUUID} = require("node:crypto");
const {Client} = require("pg");
let stage = "target-validation";
let connection;
const root = path.resolve(__dirname,"..");
const pending = ["20261014133000_outbound_gp_issue_stock_marker","20261014134000_outbound_gp_issued_valuation_immutable","20261014153000_outbound_gp_issue_time_stock"];
const adminPurgeMigration = "20261024103500_admin_tenant_purge_scoped_evidence";
const prepaidMigration = "20261024194500_paid_workspace_provisioning";
const upgradeMigrations = [...pending, adminPurgeMigration, prepaidMigration];

function migrate(schema, env) {
  const args = [path.join(root,"node_modules/prisma/build/index.js"),"migrate","deploy"];
  if (schema) args.push("--schema",schema);
  const result = spawnSync(process.execPath,args,{cwd:root,env,encoding:"utf8",windowsHide:true,timeout:120_000,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,"Disposable Prisma migration subprocess failed");
}

async function businessFingerprint() {
  const tables=(await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','prepaid_workspace_approvals') ORDER BY tablename")).rows.map(r=>r.tablename);
  assert.ok(tables.every(t=>/^[a-z_][a-z0-9_]*$/.test(t)));
  const rows=[];
  for (const table of tables) {
    const json=table==="outbound_gate_passes" ? "to_jsonb(t)-'issueStockDeductedAt'" : "to_jsonb(t)";
    const row=(await connection.query(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(md5((${json})::text),'' ORDER BY md5((${json})::text)),'')) AS checksum FROM "${table}" t`)).rows[0];
    rows.push({table,...row});
  }
  return rows;
}

(async()=>{
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1","localhost"].includes(url.hostname));
  assert.ok(["postgres:","postgresql:"].includes(url.protocol));
  const database=decodeURIComponent(url.pathname.slice(1));
  assert.match(database,/^munshios_gatepass_upgrade_[a-z0-9_]+$/);
  const admin = new URL(url); admin.pathname="/postgres";
  stage="fresh-database";
  const creator=new Client({connectionString:admin.toString()});
  await creator.connect();
  try {
    assert.match((await creator.query("SHOW server_version")).rows[0].server_version,/^18\./);
    // CREATE fails if a prior DB exists: never reset/drop/reseed an existing target.
    await creator.query(`CREATE DATABASE "${database}"`);
  } finally {await creator.end();}
  const dirs=fs.readdirSync(path.join(root,"prisma/migrations"),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
  assert.equal(dirs.length,138); assert.deepEqual(dirs.slice(-upgradeMigrations.length),upgradeMigrations);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"munshios-gp-v2-upgrade-"));
  const migrations=path.join(scratch,"migrations");fs.mkdirSync(migrations);
  fs.copyFileSync(path.join(root,"prisma/schema.prisma"),path.join(scratch,"schema.prisma"));
  fs.copyFileSync(path.join(root,"prisma/migrations/migration_lock.toml"),path.join(migrations,"migration_lock.toml"));
  for (const migration of dirs.slice(0,-upgradeMigrations.length)) fs.cpSync(path.join(root,"prisma/migrations",migration),path.join(migrations,migration),{recursive:true,errorOnExist:true,force:false});
  const env={...process.env,DATABASE_URL:url.toString()};
  stage="133-migration-baseline";migrate(path.join(scratch,"schema.prisma"),env);
  connection=new Client({connectionString:url.toString()});await connection.connect();
  const w="4bc313cf-2869-4d87-8f1e-22a147f18d2d", customer=randomUUID(), product=randomUUID();
  stage="synthetic-legacy-fixtures";
  await connection.query('INSERT INTO workspaces (id,name,"updatedAt") VALUES ($1,\'Synthetic upgrade workspace\',now())',[w]);
  await connection.query('INSERT INTO customers (id,"workspaceId",name,"updatedAt") VALUES ($1,$2,\'Synthetic legacy customer\',now())',[customer,w]);
  await connection.query('INSERT INTO products (id,"workspaceId",name,"updatedAt") VALUES ($1,$2,\'Synthetic zero-stock legacy product\',now())',[product,w]);
  for (const status of ["DRAFT","ISSUED","IN_TRANSIT"]) {
    const id=randomUUID();
    await connection.query('INSERT INTO outbound_gate_passes (id,"workspaceId","customerId","gatePassNumber",status,"gatePassDate","idempotencyKey","requestFingerprint","createdById","issuedAt","dispatchedAt","updatedAt") VALUES ($1,$2,$3,$4,$5::"OutboundGatePassStatus",now(),$6,\'synthetic-only\',$7,CASE WHEN $5=\'DRAFT\' THEN NULL ELSE now() END,CASE WHEN $5=\'IN_TRANSIT\' THEN now() ELSE NULL END,now())',[id,w,customer,`SYNTHETIC-${status}`,status,randomUUID(),randomUUID()]);
    await connection.query('INSERT INTO outbound_gate_pass_items (id,"gatePassId","productId","productNameSnapshot","productUnitSnapshot","dispatchedQuantity") VALUES ($1,$2,$3,\'Synthetic product\',\'PIECE\',1)',[randomUUID(),id,product]);
  }
  const before=await businessFingerprint();
  stage="133-to-138-upgrade";migrate(null,env);
  stage="data-and-history-attestation";
  assert.deepEqual(await businessFingerprint(),before);
  // The only intentionally new table must contain no synthetic payment approval.
  assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM prepaid_workspace_approvals')).rows[0].count,0);
  assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM outbound_gate_passes WHERE "issueStockDeductedAt" IS NOT NULL')).rows[0].count,0);
  const ledger=(await connection.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;
  assert.deepEqual(ledger.map(m=>m.migration_name),dirs);
  for (const m of ledger) {
    assert.ok(m.finished_at);assert.equal(m.rolled_back_at,null);
    assert.equal(m.checksum,createHash("sha256").update(fs.readFileSync(path.join(root,"prisma/migrations",m.migration_name,"migration.sql"))).digest("hex"));
  }
  stage="idempotent-migration-replay";migrate(null,env);
  assert.equal((await connection.query('SELECT COUNT(*)::int AS count FROM _prisma_migrations')).rows[0].count,138);
  assert.deepEqual(await businessFingerprint(),before);
  console.log(JSON.stringify({result:"PASS",scope:"disposable loopback PostgreSQL18",baseline:133,final:138,checksumMatches:138,failed:0,pending:0,businessTablesUnchanged:before.length,legacyGatePassesPreserved:3,historicalIssueMarkers:"all NULL",replay:"no-op"}));
})().catch(error=>{console.error(JSON.stringify({result:"FAIL",stage,code:typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined,detail:"Stopped; no reset, resolve, retry or raw database error output"}));process.exitCode=1;}).finally(async()=>{if(connection)await connection.end();});
