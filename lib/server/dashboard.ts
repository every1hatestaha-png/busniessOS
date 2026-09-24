import "server-only";

import { db } from "@/lib/server/db";

export async function getDashboardActivity(workspaceId: string) {
  const [sales, lowStock, customerCount, supplierCount, productCount, saleCount] = await Promise.all([
    db.salesOrder.findMany({
      where: { workspaceId, status: { not: "CANCELLED" } },
      orderBy: { orderDate: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        status: true,
        total: true,
        balanceAmount: true,
        customer: { select: { companyName: true, name: true } },
      },
    }),
    db.product.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        reorderLevel: { gt: 0 },
        stockQuantity: { lte: db.product.fields.reorderLevel },
      },
      orderBy: { stockQuantity: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        reorderLevel: true,
        unit: true,
      },
    }),
    db.customer.count({ where: { workspaceId, status: "ACTIVE" } }),
    db.supplier.count({ where: { workspaceId } }),
    db.product.count({ where: { workspaceId, status: "ACTIVE" } }),
    db.salesOrder.count({ where: { workspaceId, status: { not: "CANCELLED" } } }),
  ]);

  return {
    lowStock: lowStock.map((product) => ({ ...product, sku: product.sku ?? "No SKU" })),
    sales: sales.map((sale) => ({ id: sale.id, orderNumber: sale.orderNumber, customerName: sale.customer.companyName ?? sale.customer.name, date: sale.orderDate.toISOString(), status: sale.status, total: Number(sale.total), balance: Number(sale.balanceAmount) })),
    setup: {
      customerCount,
      supplierCount,
      productCount,
      saleCount,
      complete: customerCount > 0 && productCount > 0 && saleCount > 0,
    },
  };
}
