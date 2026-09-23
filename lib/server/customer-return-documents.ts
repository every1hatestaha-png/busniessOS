import "server-only";

import { db } from "@/lib/server/db";

export async function getCustomerReturnDocument(workspaceId: string, returnId: string) {
  const customerReturn = await db.customerReturn.findFirst({
    where: { id: returnId, workspaceId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          companyName: true,
          phone: true,
          address: true,
          city: true,
          taxId: true,
        },
      },
      salesOrder: { select: { id: true, orderNumber: true } },
      creditNote: {
        select: {
          id: true,
          number: true,
          amount: true,
          appliedAmount: true,
          remainingAmount: true,
          status: true,
        },
      },
      items: true,
    },
  });
  if (!customerReturn) return null;

  const products = await db.product.findMany({
    where: {
      workspaceId,
      id: { in: [...new Set(customerReturn.items.map((item) => item.productId))] },
    },
    select: { id: true, name: true, sku: true, unit: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  return {
    id: customerReturn.id,
    number: customerReturn.number,
    date: customerReturn.date,
    reason: customerReturn.reason,
    notes: customerReturn.notes,
    restock: customerReturn.restock,
    totalAmount: Number(customerReturn.totalAmount),
    status: customerReturn.creditNote?.status === "CANCELLED" ? "CANCELLED" as const : "POSTED" as const,
    customer: {
      ...customerReturn.customer,
      displayName: customerReturn.customer.companyName ?? customerReturn.customer.name,
    },
    salesOrder: customerReturn.salesOrder,
    creditNote: customerReturn.creditNote
      ? {
          ...customerReturn.creditNote,
          amount: Number(customerReturn.creditNote.amount),
          appliedAmount: Number(customerReturn.creditNote.appliedAmount),
          remainingAmount: Number(customerReturn.creditNote.remainingAmount),
        }
      : null,
    items: customerReturn.items.map((item) => {
      const product = productById.get(item.productId);
      return {
        id: item.id,
        productId: item.productId,
        productName: product?.name ?? "Product",
        sku: product?.sku ?? "",
        unit: product?.unit ?? "",
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      };
    }),
  };
}
