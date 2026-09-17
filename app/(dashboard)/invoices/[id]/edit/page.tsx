import { notFound } from "next/navigation";

import { InvoiceEditForm } from "@/components/invoices/invoice-edit-form";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { getInvoiceDocumentMetadata } from "@/lib/server/invoice-document";
import { getInvoiceFinancialLockReason } from "@/lib/server/invoice-edit";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");

  const invoice = await db.invoice.findFirst({
    where: { id, workspaceId },
    include: { salesOrder: { include: { items: true } } },
  });
  if (!invoice || !invoice.salesOrder) notFound();

  const [metadata, financialLockReason, customerRows, productRows] = await Promise.all([
    getInvoiceDocumentMetadata(workspaceId, invoice.id, invoice.invoiceNumber),
    getInvoiceFinancialLockReason(workspaceId, invoice.id),
    db.customer.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: [{ companyName: "asc" }, { name: "asc" }], select: { id: true, name: true, companyName: true } }),
    db.product.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, sellingPrice: true, stockQuantity: true, defaultWeightKg: true } }),
  ]);

  const lineDiscount = invoice.salesOrder.items.reduce((sum, item) => sum + Number(item.discountPerUnit) * Number(item.quantity), 0);
  const orderDiscount = Math.max(0, Number(invoice.salesOrder.discount) - lineDiscount);
  const taxable = Math.max(0, Number(invoice.salesOrder.subtotal) - Number(invoice.salesOrder.discount));
  const gstAmount = Math.max(0, Number(invoice.amount) - taxable);
  const gstRate = taxable > 0 ? Number(((gstAmount / taxable) * 100).toFixed(4)) : 0;

  return <InvoiceEditForm
    invoice={{
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      dcNumber: metadata.dcNumber,
      documentNotes: metadata.notes ?? "",
      customerId: invoice.customerId,
      orderDiscount,
      gstRate,
      saleNotes: invoice.salesOrder.notes ?? "",
      items: invoice.salesOrder.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        pricingMode: item.pricingMode,
        unitWeight: item.unitWeight ? Number(item.unitWeight) : null,
        perKgRate: item.perKgRate ? Number(item.perKgRate) : null,
        unitPrice: Number(item.unitPrice),
        discountPerUnit: Number(item.discountPerUnit),
      })),
    }}
    customers={customerRows.map((customer) => ({ id: customer.id, label: customer.companyName ? `${customer.companyName} · ${customer.name}` : customer.name }))}
    products={productRows.map((product) => ({ id: product.id, name: product.name, sku: product.sku ?? "", sellingPrice: Number(product.sellingPrice), stockQuantity: Number(product.stockQuantity), defaultWeightKg: product.defaultWeightKg ? Number(product.defaultWeightKg) : null }))}
    financialLockReason={financialLockReason}
  />;
}
