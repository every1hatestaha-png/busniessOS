const { Client } = require("pg");
const { randomUUID } = require("node:crypto");

const url = process.env.DATABASE_URL;
if (!url || !url.includes("127.0.0.1")) throw new Error("V1.88 query-plan certification requires loopback PostgreSQL.");

function flatten(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node["Node Type"]) out.push(node);
  for (const child of node.Plans ?? []) flatten(child, out);
  return out;
}

async function explain(db, sql, params) {
  const result = await db.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params);
  const payload = result.rows[0]["QUERY PLAN"][0];
  return {
    planningMs: payload["Planning Time"],
    executionMs: payload["Execution Time"],
    nodes: flatten(payload.Plan).map((node) => ({
      type: node["Node Type"],
      relation: node["Relation Name"] ?? null,
      index: node["Index Name"] ?? null,
      rows: node["Actual Rows"] ?? null,
      totalMs: node["Actual Total Time"] ?? null,
    })),
  };
}

function hasIndex(plan, name) {
  return plan.nodes.some((node) => node.index === name);
}

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(), workspace = randomUUID(), ledger = randomUUID(), bank = randomUUID();

  await db.query('INSERT INTO users (id,"clerkId",email,"updatedAt") VALUES ($1,$2,$3,now())',[user,"v188-"+user,user+"@example.invalid"]);
  await db.query('INSERT INTO workspaces (id,name,"updatedAt") VALUES ($1,$2,now())',[workspace,"V1.88 query plan"]);
  await db.query('INSERT INTO workspace_members (id,"workspaceId","userId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',[randomUUID(),workspace,user]);
  await db.query('INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled,config,"updatedAt") VALUES ($1,\'restaurant\',true,\'{}\'::jsonb,now())',[workspace]);
  await db.query('INSERT INTO accounts (id,"workspaceId",code,name,category,"normalBalance","updatedAt") VALUES ($1,$2,\'V188-BANK\',\'V1.88 bank\',\'ASSET\',\'DEBIT\',now())',[ledger,workspace]);
  await db.query('INSERT INTO cash_bank_accounts (id,"workspaceId","accountId",name,"isBank","updatedAt") VALUES ($1,$2,$3,\'V1.88 bank\',true,now())',[bank,workspace,ledger]);

  await db.query(`
    INSERT INTO restaurant_orders (
      "workspaceId","orderNumber",source,"fulfillmentType",status,"paymentStatus",total,"createdById","createdAt","updatedAt"
    )
    SELECT $1::uuid, 'V188-' || g::text, 'MANUAL', 'TAKEAWAY',
           CASE WHEN g % 5 = 0 THEN 'COMPLETED' ELSE 'PENDING_REVIEW' END,
           'UNPAID', 100, $2,
           now() - (g * interval '1 second'),
           now() - (g * interval '1 second')
    FROM generate_series(1,20000) AS g
  `,[workspace,user]);

  await db.query(`
    INSERT INTO restaurant_payments (
      "workspaceId","restaurantOrderId","cashBankAccountId",method,amount,"createdById","createdAt"
    )
    SELECT $1::uuid, ro.id, $2, 'BANK_TRANSFER', 50, $3, ro."createdAt" + interval '100 milliseconds'
    FROM restaurant_orders ro
    WHERE ro."workspaceId"=$1::uuid AND (substring(ro."orderNumber" from 6)::int % 2)=0
  `,[workspace,bank,user]);

  await db.query("ANALYZE restaurant_orders");
  await db.query("ANALYZE restaurant_payments");

  const latestOrders = await explain(db,
    'SELECT "id","createdAt" FROM restaurant_orders WHERE "workspaceId"=$1::uuid ORDER BY "createdAt" DESC LIMIT 200',
    [workspace]);
  const latestPayments = await explain(db,
    'SELECT "id","createdAt" FROM restaurant_payments WHERE "workspaceId"=$1::uuid ORDER BY "createdAt" DESC LIMIT 500',
    [workspace]);

  const visible = await db.query(
    'SELECT "id" FROM restaurant_orders WHERE "workspaceId"=$1::uuid ORDER BY "createdAt" DESC LIMIT 200',
    [workspace],
  );
  const ids = visible.rows.map((row) => row.id);
  const scopedSummary = await explain(db, `
    SELECT ro."id"::text AS "restaurantOrderId",
      GREATEST(ro."total" - COALESCE((
        SELECT SUM(rr."total") FROM restaurant_returns rr
        WHERE rr."workspaceId"=$1::uuid AND rr."restaurantOrderId"=ro."id"
      ),0),0) AS "adjustedDue",
      GREATEST(COALESCE((
        SELECT SUM(rp."amount") FROM restaurant_payments rp
        WHERE rp."workspaceId"=$1::uuid AND rp."restaurantOrderId"=ro."id" AND rp."voidedAt" IS NULL
      ),0) - COALESCE((
        SELECT SUM(rrpa."amount")
        FROM restaurant_return_payment_allocations rrpa
        INNER JOIN restaurant_payments allocated_payment
          ON allocated_payment."id"=rrpa."restaurantPaymentId" AND allocated_payment."workspaceId"=rrpa."workspaceId"
        WHERE rrpa."workspaceId"=$1::uuid
          AND allocated_payment."restaurantOrderId"=ro."id"
          AND allocated_payment."voidedAt" IS NULL
      ),0),0) AS "retainedPaid"
    FROM restaurant_orders ro
    WHERE ro."workspaceId"=$1::uuid AND ro."id" = ANY($2::uuid[])
  `,[workspace,ids]);

  if (!hasIndex(latestOrders, "restaurant_orders_workspace_created_idx")) {
    throw new Error("Latest-order plan did not use restaurant_orders_workspace_created_idx.");
  }
  if (!hasIndex(latestPayments, "restaurant_payments_workspace_created_idx")) {
    throw new Error("Latest-payment plan did not use restaurant_payments_workspace_created_idx.");
  }
  const orderFullScan = scopedSummary.nodes.find((node) => node.type === "Seq Scan" && node.relation === "restaurant_orders" && node.rows >= 20000);
  if (orderFullScan) throw new Error("Scoped payment summary still scans the full Restaurant order history.");

  process.stdout.write(JSON.stringify({
    fixture:{orders:20000,payments:10000,visibleOrders:ids.length},
    latestOrders,
    latestPayments,
    scopedSummary,
  },null,2)+"\n");
  await db.end();
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
