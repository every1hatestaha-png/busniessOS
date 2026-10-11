WITH target AS (SELECT * FROM restaurant_orders WHERE "workspaceId"='4492dbc1-bb03-4a8b-ad3d-2259b9848438' AND id IN ('acd6ecb2-c4d9-4783-ae67-7812e9848b43','7eb06a05-a223-4814-aa69-a00127f038d2','59007b0d-80fc-4e2f-8f4c-5c551c420dde','267434ab-1188-403a-b289-a439afed0382','2cac6497-5e25-4fea-90e2-9cf3eb50aa24')),
payments AS (SELECT p.* FROM restaurant_payments p JOIN target o ON o.id=p."restaurantOrderId"),
refunds AS (SELECT r.* FROM restaurant_refunds r JOIN target o ON o.id=r."restaurantOrderId"),
sources AS (SELECT id::text AS id FROM target UNION SELECT id::text FROM payments UNION SELECT id::text FROM refunds)
SELECT jsonb_build_object(
'capturedAt',now(),'database',current_database(),
'workspace',(SELECT jsonb_build_object('id',id,'name',name,'vertical',vertical) FROM workspaces WHERE id='4492dbc1-bb03-4a8b-ad3d-2259b9848438'),
'orders',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'number',o."orderNumber",'status',o.status,'paymentStatus',o."paymentStatus",'subtotal',o.subtotal,'discount',o."discountAmount",'tax',o."taxAmount",'total',o.total,'inventoryPostedAt',o."inventoryPostedAt",'accountingPostedAt',o."accountingPostedAt",'inventoryCost',o."inventoryCost",'updatedAt',o."updatedAt",
'items',(SELECT jsonb_agg(jsonb_build_object('name',i."itemName",'quantity',i.quantity,'unitPrice',i."unitPrice",'lineTotal',i."lineTotal")) FROM restaurant_order_items i WHERE i."restaurantOrderId"=o.id),
'kitchen',(SELECT jsonb_agg(jsonb_build_object('status',k.status,'workspaceMatches',k."workspaceId"=o."workspaceId")) FROM kitchen_tickets k WHERE k."restaurantOrderId"=o.id),
'paymentCount',(SELECT count(*) FROM payments p WHERE p."restaurantOrderId"=o.id),
'refundCount',(SELECT count(*) FROM refunds r WHERE r."restaurantOrderId"=o.id),
'consumptionCount',(SELECT count(*) FROM restaurant_inventory_consumptions c WHERE c."restaurantOrderId"=o.id)) ORDER BY o."orderNumber") FROM target o),
'ledger',(SELECT jsonb_build_object('count',count(*),'debit',coalesce(sum(debit),0),'credit',coalesce(sum(credit),0),'foreignWorkspaceCount',count(*) FILTER(WHERE "workspaceId"<>'4492dbc1-bb03-4a8b-ad3d-2259b9848438')) FROM general_ledger_entries WHERE "sourceId"::text IN(SELECT id FROM sources)),
'orderStockMovements',(SELECT count(*) FROM inventory_transactions WHERE reference IN(SELECT 'RESTAURANT:'||id::text FROM target)),
'product',(SELECT jsonb_build_object('stock',p."stockQuantity",'movements',(SELECT jsonb_agg(jsonb_build_object('type',i.type,'quantity',i."quantityChanged",'unitCost',i."unitCost")) FROM inventory_transactions i WHERE i."workspaceId"=p."workspaceId" AND i."productId"=p.id)) FROM products p WHERE p.id='00d8e605-5ac8-442e-8948-39f99775acf2' AND p."workspaceId"='4492dbc1-bb03-4a8b-ad3d-2259b9848438'),
'tables',(SELECT jsonb_agg(jsonb_build_object('name',t.name,'status',t.status,'workspaceMatches',t."workspaceId"='4492dbc1-bb03-4a8b-ad3d-2259b9848438')) FROM restaurant_tables t WHERE id IN(SELECT "restaurantTableId" FROM target)),
'foreignPaymentCount',(SELECT count(*) FROM payments WHERE "workspaceId"<>'4492dbc1-bb03-4a8b-ad3d-2259b9848438'),
'foreignRefundCount',(SELECT count(*) FROM refunds WHERE "workspaceId"<>'4492dbc1-bb03-4a8b-ad3d-2259b9848438')
) AS reconciliation
