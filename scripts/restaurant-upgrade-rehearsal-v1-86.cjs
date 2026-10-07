const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
// Synthetic loopback-only rehearsal: creates a fresh database, never alters an existing one.
const repo = path.resolve(__dirname, '..');
const { Client } = createRequire(path.join(repo, 'package.json'))('pg');
const connection = { host: '127.0.0.1', port: 55432, user: 'postgres' };

async function main() {
  const name = `restaurant_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const db = new Client({ ...connection, database: name });
  await db.connect();
  const workspace = randomUUID(), user = randomUUID(), table = randomUUID();
  const order = randomUUID(), cash = randomUUID(), ledger = randomUUID(), revenue = randomUUID(), payment = randomUUID();
  const category = randomUUID(), menu = randomUUID();
  const stages = [];
  const migrations = fs.readdirSync(path.join(repo, 'prisma/migrations')).filter(x => /^\d/.test(x)).sort();
  for (const migration of migrations) {
    if (migration === '20261001113000_restaurant_table_settlement_occupancy') {
      await db.query('BEGIN');
      await db.query('INSERT INTO users (id,"clerkId",email,"updatedAt") VALUES ($1,$2,$3,now())', [user, `upgrade-${user}`, `${user}@example.invalid`]);
      await db.query('INSERT INTO workspaces (id,name,"updatedAt") VALUES ($1,$2,now())', [workspace, 'Synthetic upgrade rehearsal']);
      await db.query('INSERT INTO workspace_members (id,"workspaceId","userId",role,"updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())', [randomUUID(),workspace,user]);
      await db.query('INSERT INTO restaurant_tables (id,"workspaceId",name,status) VALUES ($1,$2,\'Legacy table\',\'OCCUPIED\')', [table,workspace]);
      await db.query('INSERT INTO restaurant_menu_categories (id,"workspaceId",name) VALUES ($1,$2,\'Legacy menu\')',[category,workspace]);
      await db.query('INSERT INTO restaurant_menu_items (id,"workspaceId","categoryId",name,price) VALUES ($1,$2,$3,\'Non-stock service\',100)',[menu,workspace,category]);
      await db.query('INSERT INTO accounts (id,"workspaceId",code,name,category,"normalBalance","updatedAt") VALUES ($1,$2,\'UP-CASH\',\'Cash\',\'ASSET\',\'DEBIT\',now()), ($3,$2,\'UP-REV\',\'Revenue\',\'INCOME\',\'CREDIT\',now())',[ledger,workspace,revenue]);
      await db.query('INSERT INTO cash_bank_accounts (id,"workspaceId","accountId",name,"updatedAt") VALUES ($1,$2,$3,\'Legacy drawer\',now())',[cash,workspace,ledger]);
      await db.query('INSERT INTO restaurant_orders (id,"workspaceId","orderNumber",source,"fulfillmentType",status,"restaurantTableId",subtotal,total,"createdById","confirmedById","confirmedAt") VALUES ($1,$2,\'LEGACY-COMPLETED\',\'POS\',\'DINE_IN\',\'CONFIRMED\',$3,100,100,$4,$4,now())',[order,workspace,table,user]);
      await db.query('INSERT INTO restaurant_order_items ("restaurantOrderId","menuItemId","itemName",quantity,"unitPrice","lineTotal") VALUES ($1,$2,\'Non-stock service\',1,100,100)',[order,menu]);
      await db.query('UPDATE restaurant_orders SET status=\'PREPARING\' WHERE id=$1',[order]);
      await db.query('UPDATE restaurant_orders SET status=\'READY\' WHERE id=$1',[order]);
      await db.query('INSERT INTO general_ledger_entries (id,"workspaceId","accountId","sourceType","sourceId","documentNo",narration,debit,credit) VALUES ($1,$2,$3,\'SALE\',$4,\'UPGRADE\',\'Synthetic receivable\',100,0),($5,$2,$6,\'SALE\',$4,\'UPGRADE\',\'Synthetic revenue\',0,100)',[randomUUID(),workspace,ledger,order,randomUUID(),revenue]);
      await db.query('UPDATE restaurant_orders SET "inventoryPostedAt"=now(),"accountingPostedAt"=now(),status=\'COMPLETED\',"completedAt"=now() WHERE id=$1',[order]);
      await db.query('COMMIT');
      stages.push('pre-V1.82 completed unpaid dine-in with balanced sale evidence');
    }
    if (migration === '20261001120000_restaurant_cash_payment_shift_integrity') {
      await db.query('INSERT INTO restaurant_payments (id,"workspaceId","restaurantOrderId","cashBankAccountId",method,amount,"createdById") VALUES ($1,$2,$3,$4,\'CASH\',10,$5)',[payment,workspace,order,cash,user]);
      stages.push('pre-V1.84 historical unposted cash receipt without shift attribution');
    }
    await db.query(fs.readFileSync(path.join(repo,'prisma/migrations',migration,'migration.sql'),'utf8'));
  }
  const rows = await db.query('SELECT ro."tableReleasedAt" IS NOT NULL AS "historicalReleasePreserved", rp."cashShiftId" IS NULL AS "legacyCashPreserved",rp.amount::text AS amount FROM restaurant_orders ro JOIN restaurant_payments rp ON rp."restaurantOrderId"=ro.id WHERE ro.id=$1',[order]);
  if (!rows.rows[0]?.historicalReleasePreserved || !rows.rows[0]?.legacyCashPreserved || rows.rows[0]?.amount !== '10.00') throw new Error('Historical evidence changed unexpectedly');
  process.stdout.write(JSON.stringify({database:name,migrations:migrations.length,stages,result:rows.rows[0]},null,2) + '\n');
  await db.end();
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
