const { Client } = require('pg');
const fs = require('fs');
const { randomUUID } = require('crypto');
const client = new Client({connectionString: process.env.DATABASE_URL});
const file = process.env.VERTICAL_REHEARSAL_STATE || '/tmp/munshi-vertical-rehearsal.json';
const snap = `${file}.before`;
async function snapshot() {
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(x => x.tablename);
  const data = {};
  for (const name of tables) {
    const nameQuoted = '"' + name.replaceAll('"','""') + '"';
    const expr = name === 'workspaces' ? "to_jsonb(t)-'vertical'" : 'to_jsonb(t)';
    const rows = (await client.query(`SELECT ${expr} AS row FROM ${nameQuoted} t`)).rows.map(x => x.row);
    data[name] = rows.map(x => JSON.stringify(Object.keys(x).sort().map(k => [k,x[k]]))).sort();
  }
  return data;
}
(async () => {
  await client.connect();
  const mode = process.argv[2];
  if (mode === 'seed') {
    await client.query('BEGIN');
    const ids = { workspaces: [], users: [], customers: [], suppliers: [], products: [] };
    for (const [i,type] of ['WHOLESALER','DISTRIBUTOR','RETAILER','MANUFACTURER','OTHER','OTHER','OTHER'].entries()) {
      const id = randomUUID(); ids.workspaces.push(id);
      await client.query('INSERT INTO workspaces (id,name,"businessType","updatedAt") VALUES ($1,$2,$3,now())',[id,`synthetic-${type}-${i}`,type]);
      await client.query('INSERT INTO workspace_subscriptions (id,"workspaceId",status) VALUES ($1,$2,$3)',[randomUUID(),id,'TRIALING']);
      for(const module of ['inventory','accounting', ...(i===0?['manufacturing']:[]), ...(i===4?['restaurant']:[]), ...(i===5?['services']:[])]) {
        await client.query('INSERT INTO workspace_modules ("workspaceId","moduleKey",enabled) VALUES ($1,$2,true)',[id,module]);
      }
    }
    for (const i of [0,1,2]) {
      const id=randomUUID(); ids.users.push(id);
      await client.query('INSERT INTO users (id,"clerkId",email,"updatedAt") VALUES ($1,$2,$3,now())',[id,`synthetic-${id}`,`synthetic${i}@example.invalid`]);
    }
    const roles=[['OWNER','ADMIN','STAFF'],['STAFF','OWNER','ADMIN'],['ADMIN','STAFF','OWNER'],['OWNER','ADMIN','STAFF'],['OWNER','STAFF','ADMIN'],['ADMIN','OWNER','STAFF'],['STAFF','ADMIN','OWNER']];
    for(let i=0;i<ids.workspaces.length;i++) for(let j=0;j<3;j++) {
      await client.query('INSERT INTO workspace_members (id,"workspaceId","userId",role,"updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),ids.workspaces[i],ids.users[j],roles[i][j]]);
    }
    for(let i=0;i<ids.workspaces.length;i++) {
      const ws=ids.workspaces[i],customer=randomUUID(),supplier=randomUUID(),product=randomUUID();
      ids.customers.push(customer);ids.suppliers.push(supplier);ids.products.push(product);
      await client.query('INSERT INTO customers (id,"workspaceId",name,"updatedAt") VALUES ($1,$2,$3,now())',[customer,ws,`Synthetic Customer ${i}`]);
      await client.query('INSERT INTO suppliers (id,"workspaceId",name,"updatedAt") VALUES ($1,$2,$3,now())',[supplier,ws,`Synthetic Supplier ${i}`]);
      await client.query('INSERT INTO products (id,"workspaceId",name,sku,"stockQuantity","updatedAt") VALUES ($1,$2,$3,$4,10,now())',[product,ws,`Synthetic Product ${i}`,`SYN-${i}`]);
      await client.query('INSERT INTO inventory_transactions (id,"workspaceId","productId",type,"quantityChanged") VALUES ($1,$2,$3,$4,10)',[randomUUID(),ws,product,'OPENING_STOCK']);
      await client.query('INSERT INTO sales_orders (id,"workspaceId","customerId","orderNumber","updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),ws,customer,`SYN-SALE-${i}`]);
      await client.query('INSERT INTO purchase_orders (id,"workspaceId","supplierId","orderNumber","updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),ws,supplier,`SYN-PO-${i}`]);
      await client.query('INSERT INTO payments (id,"workspaceId","customerId",amount,"updatedAt") VALUES ($1,$2,$3,5,now())',[randomUUID(),ws,customer]);
      await client.query('INSERT INTO audit_logs (id,"workspaceId","actorId",action,"entityType","entityId") VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),ws,ids.users[0],'synthetic.seed','Workspace',ws]);
      const account=randomUUID();
      await client.query('INSERT INTO accounts (id,"workspaceId",code,name,category,"normalBalance","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())',[account,ws,`SYN-${i}`,'Synthetic Cash','ASSET','DEBIT']);
      await client.query('INSERT INTO cash_bank_accounts (id,"workspaceId","accountId",name,"updatedAt") VALUES ($1,$2,$3,$4,now())',[randomUUID(),ws,account,'Synthetic Cash']);
    }
    await client.query('COMMIT');
    fs.writeFileSync(file,JSON.stringify(ids));
    fs.writeFileSync(snap,JSON.stringify(await snapshot()));
    console.log('seeded',ids.workspaces.length,'workspaces',ids.users.length,'users, and representative ERP rows');
  } else if(mode === 'verify') {
    const ids=JSON.parse(fs.readFileSync(file));
    const before=JSON.parse(fs.readFileSync(snap));
    const after=await snapshot();
    if(JSON.stringify(before)!==JSON.stringify(after)) {
      const changed=Object.keys(after).filter(x=>JSON.stringify(before[x])!==JSON.stringify(after[x]));
      throw new Error('unexpected table changes: '+changed.join(','));
    }
    const ws=(await client.query('SELECT id,"businessType",vertical FROM workspaces ORDER BY name')).rows;
    const expected={WHOLESALER:'TRADING',DISTRIBUTOR:'TRADING',RETAILER:'TRADING',MANUFACTURER:'MANUFACTURING',OTHER:'LEGACY'};
    for(const row of ws) if(row.vertical!==expected[row.businessType]) throw new Error(`wrong mapping: ${JSON.stringify(row)}`);
    console.log('PASS migration mapping',ws.map(w=>`${w.businessType}:${w.vertical}`).join(','));
    console.log('PASS all non-migration table rows byte-equivalent after omitting new vertical');
    console.log('PASS membership/module/accounting/inventory/sales/purchase/payment/subscription/audit data retained');
    const enumValues = (await client.query(`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='WorkspaceVertical' ORDER BY enumsortorder`)).rows.map(x=>x.enumlabel);
    if (JSON.stringify(enumValues)!==JSON.stringify(['TRADING','MANUFACTURING','LEGACY','RESTAURANT','PROPERTY','SERVICES'])) throw new Error('enum values mismatch');
    const column = (await client.query(`SELECT is_nullable,column_default FROM information_schema.columns WHERE table_name='workspaces' AND column_name='vertical'`)).rows[0];
    if (column?.is_nullable!=='NO' || !column.column_default?.includes('LEGACY')) throw new Error('column constraints/default mismatch');
    const indexes = (await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='workspaces'`)).rows.map(x=>x.indexname);
    if (!indexes.some(x=>x.includes('pkey'))) throw new Error('workspace primary key index missing');
    const defaultId=randomUUID();
    await client.query('BEGIN');
    await client.query('INSERT INTO workspaces (id,name,"businessType","updatedAt") VALUES ($1,$2,$3,now())',[defaultId,'default-probe','OTHER']);
    const defaultValue=(await client.query('SELECT vertical FROM workspaces WHERE id=$1',[defaultId])).rows[0]?.vertical;
    if(defaultValue!=='LEGACY') throw new Error('new row default mismatch');
    await client.query('ROLLBACK');
    if((await client.query('SELECT COUNT(*)::int AS count FROM workspaces WHERE id=$1',[defaultId])).rows[0].count!==0) throw new Error('rollback did not remove probe');
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const prisma = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
    try {
      const loaded=await prisma.workspace.findUniqueOrThrow({where:{id:ids.workspaces[0]},select:{vertical:true}});
      if(loaded.vertical!=='TRADING') throw new Error('Prisma enum read mismatch');
      await prisma.$transaction(async tx=>{
        await tx.workspace.update({where:{id:ids.workspaces[0]},data:{vertical:'MANUFACTURING'}});
        throw new Error('expected-rollback');
      }).catch(e=>{if(e.message!=='expected-rollback')throw e});
      const restored=await prisma.workspace.findUniqueOrThrow({where:{id:ids.workspaces[0]},select:{vertical:true}});
      if(restored.vertical!=='TRADING')throw new Error('Prisma transaction rollback mismatch');
      for(const vertical of ['RESTAURANT','PROPERTY','SERVICES']) {
        const id=randomUUID();
        await prisma.workspace.create({data:{id,name:`unavailable-${vertical}`,businessType:'OTHER',vertical}});
        await prisma.workspace.delete({where:{id}});
      }
    } finally { await prisma.$disconnect(); }
    console.log('PASS native enum, constraints/default, index, Prisma client, transaction rollback, unavailable vertical storage');
  }
  await client.end();
})().catch(async e=>{console.error(e);await client.end().catch(()=>{});process.exit(1)});
