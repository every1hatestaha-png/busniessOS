import "server-only";

import { db } from "@/lib/server/db";

export async function getDashboardActivity(workspaceId: string) {
  const [sales, lowStock] = await Promise.all([
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
      where: { workspaceId, stockQuantity: { lte: db.product.fields.reorderLevel } },
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
  ]);

  return {
    lowStock: lowStock.map((product) => ({ ...product, sku: product.sku ?? "No SKU" })),
    sales: sales.map((sale) => ({ id: sale.id, orderNumber: sale.orderNumber, customerName: sale.customer.companyName ?? sale.customer.name, date: sale.orderDate.toISOString(), status: sale.status, total: Number(sale.total), balance: Number(sale.balanceAmount) })),
  };
}
