const { Client } = require("pg");
const { randomUUID } = require("node:crypto");

const url = process.env.DATABASE_URL;
if (!url || !url.includes("127.0.0.1")) {
  throw new Error("Query-plan audit requires an isolated loopback PostgreSQL database.");
}

function walk(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node["Node Type"]) {
    out.push({
      type: node["Node Type"],
      relation: node["Relation Name"] ?? null,
      index: node["Index Name"] ?? null,
      actualRows: node["Actual Rows"] ?? null,
      rowsRemoved: node["Rows Removed by Filter"] ?? null,
      startupMs: node["Actual Startup Time"] ?? null,
      totalMs: node["Actual Total Time"] ?? null,
      loops: node["Actual Loops"] ?? null,
    });
  }
  for (const plan of node.Plans ?? []) walk(plan, out);
  return out;
}

async function explain(client, sql, params) {
  const result = await client.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params);
  const payload = result.rows[0]["QUERY PLAN"][0];
  return {
    planningMs: payload["Planning Time"],
    executionMs: payload["Execution Time"],
    nodes: walk(payload.Plan),
  };
}

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  const user = randomUUID();
  const workspace = randomUUID();
  const ledger = randomUUID();
  const bank = randomUUID();

  await db.query(
    'INSERT INTO users (id,"clerkId",email,"updatedAt") VALUES ($1,$2,$3,now())',
    [user, "perf-" + user, user + "@example.invalid"],
  );
  await db.query(
    'INSERT INTO workspaces (id,name,"updatedAt") VALUES ($1,$2,now())',
    [workspace, "Restaurant performance audit"],
  );
  await db.query(
    'INSERT INTO workspace_members (id,"workspaceId","userId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())',
    [randomUUID(), workspace, user],
  );
  await db.query(
    'INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled,config,"updatedAt") VALUES ($1,\'restaurant\',true,\'{}\'::jsonb,now())',
    [workspace],
  );
  await db.query(
    'INSERT INTO accounts (id,"workspaceId",code,name,category,"normalBalance","updatedAt") VALUES ($1,$2,\'PERF-BANK\',\'Performance bank\',\'ASSET\',\'DEBIT\',now())',
    [ledger, workspace],
  );
  await db.query(
    'INSERT INTO cash_bank_accounts (id,"workspaceId","accountId",name,"isBank","updatedAt") VALUES ($1,$2,$3,\'Performance bank\',true,now())',
    [bank, workspace, ledger],
  );

  await db.query(
    `INSERT INTO restaurant_orders (
      "workspaceId","orderNumber",source,"fulfillmentType",status,"paymentStatus",
      total,"createdById","createdAt","updatedAt"
    )
    SELECT $1::uuid,
           'PERF-' || g::text,
           'MANUAL',
           'TAKEAWAY',
           CASE WHEN g % 5 = 0 THEN 'COMPLETED' ELSE 'PENDING_REVIEW' END,
           'UNPAID',
           100,
           $2,
           now() - (g * interval '1 second'),
           now() - (g * interval '1 second')
    FROM generate_series(1, 20000) AS g`,
    [workspace, user],
  );

  // Use every second order to keep the payment fixture representative without
  // making the CI audit unnecessarily slow.
  await db.query(
    `INSERT INTO restaurant_payments (
      "workspaceId","restaurantOrderId","cashBankAccountId",method,amount,"createdById","createdAt"
    )
    SELECT $1::uuid, ro.id, $2, 'BANK_TRANSFER', 50, $3, ro."createdAt" + interval '100 milliseconds'
    FROM restaurant_orders ro
    WHERE ro."workspaceId"=$1::uuid
      AND (substring(ro."orderNumber" from 6)::int % 2) = 0`,
    [workspace, bank, user],
  );
  await db.query("ANALYZE restaurant_orders");
  await db.query("ANALYZE restaurant_payments");

  const latestOrders = await explain(
    db,
    `SELECT ro."id", ro."createdAt"
     FROM restaurant_orders ro
     WHERE ro."workspaceId"=$1::uuid
     ORDER BY ro."createdAt" DESC
     LIMIT 200`,
    [workspace],
  );

  const latestPayments = await explain(
    db,
    `SELECT rp."id", rp."createdAt"
     FROM restaurant_payments rp
     WHERE rp."workspaceId"=$1::uuid
     ORDER BY rp."createdAt" DESC
     LIMIT 500`,
    [workspace],
  );

  const paymentSummary = await explain(
    db,
    `SELECT ro."id"::text AS "restaurantOrderId",
       GREATEST(ro."total" - COALESCE(ret."returnedTotal", 0), 0)::numeric(15,2) AS "adjustedDue",
       GREATEST(COALESCE(pay."activePaid", 0) - COALESCE(alloc."activeAllocated", 0), 0)::numeric(15,2) AS "retainedPaid"
     FROM restaurant_orders ro
     LEFT JOIN (
       SELECT "restaurantOrderId", SUM("total") AS "returnedTotal"
       FROM restaurant_returns
       WHERE "workspaceId"=$1::uuid
       GROUP BY "restaurantOrderId"
     ) ret ON ret."restaurantOrderId"=ro."id"
     LEFT JOIN (
       SELECT "restaurantOrderId", SUM("amount") AS "activePaid"
       FROM restaurant_payments
       WHERE "workspaceId"=$1::uuid AND "voidedAt" IS NULL
       GROUP BY "restaurantOrderId"
     ) pay ON pay."restaurantOrderId"=ro."id"
     LEFT JOIN (
       SELECT rp."restaurantOrderId", SUM(rrpa."amount") AS "activeAllocated"
       FROM restaurant_return_payment_allocations rrpa
       INNER JOIN restaurant_payments rp
         ON rp."id"=rrpa."restaurantPaymentId" AND rp."workspaceId"=rrpa."workspaceId"
       WHERE rrpa."workspaceId"=$1::uuid AND rp."voidedAt" IS NULL
       GROUP BY rp."restaurantOrderId"
     ) alloc ON alloc."restaurantOrderId"=ro."id"
     WHERE ro."workspaceId"=$1::uuid`,
    [workspace],
  );

  const report = {
    fixture: { orders: 20000, payments: 10000 },
    latestOrders,
    latestPayments,
    paymentSummary,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
