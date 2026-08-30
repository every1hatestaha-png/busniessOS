import "server-only";

import { db } from "@/lib/server/db";
import { getReceivablesAging } from "@/lib/server/receivables";

export async function getDashboardSummary(workspaceId: string) {
  const [customers, products, sales, receivables] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId },
      select: { currentBalance: true },
    }),
    db.product.findMany({
      where: { workspaceId },
      orderBy: { stockQuantity: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        reorderLevel: true,
        unit: true,
        costPrice: true,
        category: true,
      },
    }),
    db.salesOrder.findMany({ where: { workspaceId, status: { not: "CANCELLED" } }, orderBy: { orderDate: "desc" }, include: { customer: { select: { companyName: true, name: true } } } }),
    getReceivablesAging(workspaceId),
  ]);

  const lowStock = products.filter((product) => product.stockQuantity <= product.reorderLevel);

  return {
    customerCount: customers.length,
    customersWithBalance: receivables.customers.filter((customer) => customer.totalOutstanding > 0).length,
    receivables: receivables.totalOutstanding,
    productCount: products.length,
    categoryCount: new Set(products.map((product) => product.category).filter(Boolean)).size,
    inventoryValue: products.reduce((sum, product) => sum + product.stockQuantity * Number(product.costPrice), 0),
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 4).map((product) => ({ ...product, sku: product.sku ?? "No SKU" })),
    sales: sales.map((sale) => ({ id: sale.id, orderNumber: sale.orderNumber, customerName: sale.customer.companyName ?? sale.customer.name, date: sale.orderDate.toISOString(), status: sale.status, total: Number(sale.total), paid: Number(sale.paidAmount), balance: Number(sale.balanceAmount) })),
  };
}
