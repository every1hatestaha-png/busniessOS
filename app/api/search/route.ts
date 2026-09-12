import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import type { SearchResult } from "@/lib/search";

export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] satisfies SearchResult[] });
  const term = q.slice(0, 80);
  const [customers, products, sales, invoices] = await Promise.all([
    db.customer.findMany({ where: { workspaceId, OR: [{ name: { contains: term, mode: "insensitive" } }, { companyName: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }] }, take: 5, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, companyName: true, phone: true } }),
    db.product.findMany({ where: { workspaceId, OR: [{ name: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }] }, take: 5, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, sku: true, stockQuantity: true } }),
    db.salesOrder.findMany({ where: { workspaceId, orderNumber: { contains: term, mode: "insensitive" } }, take: 5, orderBy: { updatedAt: "desc" }, select: { id: true, orderNumber: true, total: true, customer: { select: { companyName: true, name: true } } } }),
    db.invoice.findMany({ where: { workspaceId, invoiceNumber: { contains: term, mode: "insensitive" } }, take: 5, orderBy: { updatedAt: "desc" }, select: { id: true, invoiceNumber: true, amount: true, customer: { select: { companyName: true, name: true } } } }),
  ]);
  const results: SearchResult[] = [
    ...customers.map((x) => ({ id: x.id, type: "Customer" as const, title: x.companyName ?? x.name, detail: `${x.name} · ${x.phone ?? "No phone"}`, href: `/customers/${x.id}` })),
    ...products.map((x) => ({ id: x.id, type: "Product" as const, title: x.name, detail: `${x.sku ?? "No SKU"} · ${x.stockQuantity} in stock`, href: `/inventory/${x.id}` })),
    ...sales.map((x) => ({ id: x.id, type: "Order" as const, title: x.orderNumber, detail: `${x.customer.companyName ?? x.customer.name} · Rs ${Number(x.total).toLocaleString("en-PK")}`, href: `/sales/${x.id}` })),
    ...invoices.map((x) => ({ id: x.id, type: "Invoice" as const, title: x.invoiceNumber, detail: `${x.customer.companyName ?? x.customer.name} · Rs ${Number(x.amount).toLocaleString("en-PK")}`, href: `/invoices/${x.id}` })),
  ];
  return NextResponse.json({ results: results.slice(0, 12) });
}
