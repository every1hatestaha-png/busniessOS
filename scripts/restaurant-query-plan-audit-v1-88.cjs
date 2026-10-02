/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const url = process.env.DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/munshios_restaurant_perf") {
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
      sharedHitBlocks: node["Shared Hit Blocks"] ?? null,
      sharedReadBlocks: node["Shared Read Blocks"] ?? null,
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
  try {
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
  const category = randomUUID();
  await db.query('INSERT INTO restaurant_menu_categories (id,"workspaceId",name) VALUES ($1,$2,\'Synthetic performance menu\')',[category,workspace]);
  await db.query(`INSERT INTO restaurant_menu_items ("workspaceId","categoryId",name,price) SELECT $1::uuid,$2::uuid,'Synthetic menu ' || g::text,100 FROM generate_series(1,500) g`,[workspace,category]);
  await db.query(`INSERT INTO restaurant_tables ("workspaceId",name,capacity,status) SELECT $1::uuid,'Synthetic table ' || g::text,4,'AVAILABLE' FROM generate_series(1,200) g`,[workspace]);
  await db.query(`INSERT INTO restaurant_orders ("workspaceId","orderNumber",source,"fulfillmentType",status,total,"createdById","createdAt","updatedAt") SELECT $1::uuid,'KPERF-' || g::text,'MANUAL','TAKEAWAY',CASE WHEN g%2=0 THEN 'READY' ELSE 'CONFIRMED' END,100,$2,now()-(g*interval '1 second'),now() FROM generate_series(1,2000) g`,[workspace,user]);
  await db.query(`INSERT INTO kitchen_tickets ("workspaceId","restaurantOrderId","ticketNumber",status) SELECT $1::uuid,id,'KOT-' || "orderNumber",'QUEUED' FROM restaurant_orders WHERE "workspaceId"=$1::uuid AND "orderNumber" LIKE 'KPERF-%'`,[workspace]);
  await db.query(`UPDATE kitchen_tickets kt SET status='PREPARING',"startedAt"=now(),"updatedAt"=now() FROM restaurant_orders ro WHERE kt."workspaceId"=$1::uuid AND ro.id=kt."restaurantOrderId" AND ro."workspaceId"=kt."workspaceId" AND ro.status='READY'`,[workspace]);
  await db.query(`UPDATE kitchen_tickets kt SET status='READY',"readyAt"=now(),"updatedAt"=now() FROM restaurant_orders ro WHERE kt."workspaceId"=$1::uuid AND ro.id=kt."restaurantOrderId" AND ro."workspaceId"=kt."workspaceId" AND ro.status='READY'`,[workspace]);
  execFileSync(process.execPath, [path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "tests/integration/restaurant-perf-fixture-v1-88.test.ts"], { stdio: "inherit", env: { ...process.env, RUN_INTEGRATION_TESTS: "true", RESTAURANT_PERF_WORKSPACE_ID: workspace, RESTAURANT_PERF_USER_ID: user } });
  await db.query("ANALYZE restaurant_returns");
  await db.query("ANALYZE restaurant_refunds");
  await db.query("ANALYZE general_ledger_entries");
  await db.query("ANALYZE restaurant_menu_items");
  await db.query("ANALYZE restaurant_tables");
  await db.query("ANALYZE kitchen_tickets");
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

  const kitchenQueue = await explain(db, `SELECT ro.id,ro."createdAt" FROM restaurant_orders ro LEFT JOIN restaurant_tables rt ON rt.id=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId" WHERE ro."workspaceId"=$1::uuid AND ro.status IN ('CONFIRMED','PREPARING','READY') ORDER BY ro."createdAt" ASC,ro.id ASC LIMIT 200`,[workspace]);
  const posMenu = await explain(db, `SELECT mi.id,mi.name,mi.price,mc.name AS category FROM restaurant_menu_items mi INNER JOIN restaurant_menu_categories mc ON mc.id=mi."categoryId" AND mc."workspaceId"=mi."workspaceId" WHERE mi."workspaceId"=$1::uuid ORDER BY mc."sortOrder",mc.name,mi."sortOrder",mi.name`,[workspace]);
  const posCategories = await explain(db, `SELECT id,name,"sortOrder","isActive" FROM restaurant_menu_categories WHERE "workspaceId"=$1::uuid ORDER BY "sortOrder",name`,[workspace]);
  const tables = await explain(db, `SELECT * FROM restaurant_tables WHERE "workspaceId"=$1::uuid ORDER BY name`,[workspace]);
  const dashboardMetrics = await explain(db, `SELECT COALESCE(SUM(total) FILTER (WHERE status='COMPLETED' AND "createdAt">=(date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2)),0) AS "todaySales", COUNT(*) FILTER (WHERE "createdAt">=(date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2))::int AS "todayOrders", COUNT(*) FILTER (WHERE status IN ('CONFIRMED','PREPARING','READY'))::int AS "liveOrders", COUNT(*) FILTER (WHERE source='WHATSAPP' AND status='PENDING_REVIEW')::int AS "pendingWhatsapp", COUNT(*) FILTER (WHERE status='READY')::int AS "readyOrders" FROM restaurant_orders WHERE "workspaceId"=$1::uuid`,[workspace,'Asia/Karachi']);
  const cashReconciliation = await explain(db, `SELECT COALESCE(SUM(gle.debit),0) AS debit,COALESCE(SUM(gle.credit),0) AS credit,COALESCE(SUM(gle.debit-gle.credit),0) AS net,COUNT(*)::int AS "entryCount" FROM general_ledger_entries gle INNER JOIN cash_bank_accounts cba ON cba."workspaceId"=gle."workspaceId" AND cba."accountId"=gle."accountId" WHERE gle."workspaceId"=$1 AND cba."isBank"=false AND (gle."createdAt" AT TIME ZONE 'UTC') >= (SELECT "openedAt" FROM cash_shifts WHERE "workspaceId"=$1::uuid ORDER BY "openedAt" DESC LIMIT 1) AND (gle."createdAt" AT TIME ZONE 'UTC') <= CURRENT_TIMESTAMP`,[workspace]);
  const returnHistory = await explain(db, `SELECT * FROM restaurant_returns WHERE "workspaceId"=$1::uuid ORDER BY "createdAt" DESC,id DESC`,[workspace]);
  const refundHistory = await explain(db, `SELECT rr.*,cba.name FROM restaurant_refunds rr INNER JOIN cash_bank_accounts cba ON cba.id=rr."cashBankAccountId" AND cba."workspaceId"::uuid=rr."workspaceId" WHERE rr."workspaceId"=$1::uuid ORDER BY rr."createdAt" DESC LIMIT 500`,[workspace]);
  const fixture = {};
  for (const [key,table] of Object.entries({ orders:'restaurant_orders',payments:'restaurant_payments',menuItems:'restaurant_menu_items',tables:'restaurant_tables',kitchenTickets:'kitchen_tickets',returns:'restaurant_returns',refunds:'restaurant_refunds',cashShifts:'cash_shifts' })) fixture[key] = (await db.query(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE "workspaceId"=$1::uuid`,[workspace])).rows[0].count;
  const report = {
    fixture,
    scope: 'Single-run SQL plans on synthetic isolated PostgreSQL; financial return/refund/cash rows use real services. Not concurrent HTTP load or a latency SLO.',
    posCategories,
    tables,
    dashboardMetrics,
    cashReconciliation,
    returnHistory,
    refundHistory,
    kitchenQueue,
    posMenu,
    latestOrders,
    latestPayments,
    paymentSummary,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally { await db.end(); }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
