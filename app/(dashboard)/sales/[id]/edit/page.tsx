import { notFound } from "next/navigation";

import { EditSaleForm } from "@/components/sales/edit-sale-form";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");

  const sale = await db.salesOrder.findFirst({
    where: { id, workspaceId },
    include: { items: true, invoices: { take: 1 } },
  });
  if (!sale || !sale.invoices[0]) notFound();
  const invoice = sale.invoices[0];
  const selectedProductIds = sale.items.map((item) => item.productId);

  const [customerRows, productRows] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId, OR: [{ status: "ACTIVE" }, { id: sale.customerId }] },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true },
    }),
    db.product.findMany({
      where: { workspaceId, OR: [{ status: "ACTIVE" }, { id: { in: selectedProductIds } }] },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, sku: true, sellingPrice: true, stockQuantity: true, defaultWeightKg: true },
    }),
  ]);

  const lineDiscounts = sale.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.discountPerUnit), 0);
  const orderDiscount = Math.max(0, Number(sale.discount) - lineDiscounts);
  const taxable = Math.max(0, Number(sale.subtotal) - Number(sale.discount));
  const gstAmount = Math.max(0, Number(sale.total) - taxable);
  const gstRate = taxable > 0 ? Number(((gstAmount / taxable) * 100).toFixed(4)) : 0;

  return <EditSaleForm
    initialSale={{
      id: sale.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: sale.customerId,
      issuedAt: dateInput(invoice.issuedAt),
      dueDate: dateInput(invoice.dueDate),
      gstRate,
      orderDiscount,
      notes: sale.notes ?? "",
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        pricingMode: item.pricingMode,
        unitWeight: item.unitWeight ? Number(item.unitWeight) : undefined,
        perKgRate: item.perKgRate ? Number(item.perKgRate) : undefined,
        unitPrice: Number(item.unitPrice),
        discountPerUnit: Number(item.discountPerUnit),
      })),
    }}
    customers={customerRows.map((customer) => ({ id: customer.id, name: customer.name, companyName: customer.companyName ?? customer.name }))}
    products={productRows.map((product) => ({ id: product.id, name: product.name, sku: product.sku ?? "", sellingPrice: Number(product.sellingPrice), stockQuantity: Number(product.stockQuantity), defaultWeightKg: product.defaultWeightKg ? Number(product.defaultWeightKg) : null }))}
  />;
}
