import "server-only";

import type { SearchResult } from "@/lib/search";
import { db } from "@/lib/server/db";

export async function getSearchResults(workspaceId: string): Promise<SearchResult[]> {
  const [customers, products, sales, invoices] = await Promise.all([
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
    db.salesOrder.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, orderNumber: true, total: true, customer: { select: { companyName: true, name: true } } } }),
    db.invoice.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, invoiceNumber: true, amount: true, customer: { select: { companyName: true, name: true } } } }),
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
    ...sales.map((sale) => ({
      id: sale.id,
      type: "Order" as const,
      title: sale.orderNumber,
      detail: `${sale.customer.companyName ?? sale.customer.name} · Rs ${Number(sale.total).toLocaleString("en-PK")}`,
      href: `/sales/${sale.id}`,
    })),
    ...invoices.map((invoice) => ({
      id: invoice.id,
      type: "Invoice" as const,
      title: invoice.invoiceNumber,
      detail: `${invoice.customer.companyName ?? invoice.customer.name} · Rs ${Number(invoice.amount).toLocaleString("en-PK")}`,
      href: `/invoices/${invoice.id}`,
    })),
  ];
}
