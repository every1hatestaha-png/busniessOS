import "server-only";

import { DEMO_INVOICES, DEMO_SALES } from "@/lib/demo-data";
import type { SearchResult } from "@/lib/search";
import { db } from "@/lib/server/db";

export async function getSearchResults(workspaceId: string): Promise<SearchResult[]> {
  const [customers, products] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, name: true, companyName: true, phone: true },
    }),
    db.product.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, name: true, sku: true, stockQuantity: true },
    }),
  ]);

  return [
    ...customers.map((customer) => ({
      id: customer.id,
      type: "Customer" as const,
      title: customer.companyName ?? customer.name,
      detail: `${customer.name} · ${customer.phone ?? "No phone"}`,
      href: `/customers/${customer.id}`,
    })),
    ...products.map((product) => ({
      id: product.id,
      type: "Product" as const,
      title: product.name,
      detail: `${product.sku ?? "No SKU"} · ${product.stockQuantity} in stock`,
      href: `/inventory/${product.id}`,
    })),
    ...DEMO_SALES.map((sale) => ({
      id: sale.id,
      type: "Order" as const,
      title: sale.orderNumber,
      detail: `${sale.customerName} · Demo record`,
      href: `/sales/${sale.id}`,
    })),
    ...DEMO_INVOICES.map((invoice) => ({
      id: invoice.id,
      type: "Invoice" as const,
      title: invoice.invoiceNumber,
      detail: `${invoice.customerName} · Demo record`,
      href: `/invoices?invoice=${invoice.id}`,
    })),
  ];
}
