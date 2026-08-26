import "server-only";

import { db } from "@/lib/server/db";

export async function getDashboardSummary(workspaceId: string) {
  const [customers, products] = await Promise.all([
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
  ]);

  const lowStock = products.filter((product) => product.stockQuantity <= product.reorderLevel);

  return {
    customerCount: customers.length,
    customersWithBalance: customers.filter((customer) => customer.currentBalance.greaterThan(0)).length,
    receivables: customers.reduce((sum, customer) => sum + Number(customer.currentBalance), 0),
    productCount: products.length,
    categoryCount: new Set(products.map((product) => product.category).filter(Boolean)).size,
    inventoryValue: products.reduce((sum, product) => sum + product.stockQuantity * Number(product.costPrice), 0),
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 4).map((product) => ({ ...product, sku: product.sku ?? "No SKU" })),
  };
}
