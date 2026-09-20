import "server-only";

import { db } from "@/lib/server/db";

export async function getPurchasePriceHistory(workspaceId: string, filters: {
  from: Date;
  to: Date;
  productId?: string;
  supplierId?: string;
  search?: string;
}) {
  const rows = await db.goodReceivedNoteItem.findMany({
    where: {
      goodReceivedNote: {
        workspaceId,
        status: "ACTIVE",
        receiptDate: { gte: filters.from, lte: filters.to },
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.search ? {
        OR: [
          { product: { name: { contains: filters.search, mode: "insensitive" } } },
          { product: { sku: { contains: filters.search, mode: "insensitive" } } },
          { goodReceivedNote: { supplier: { OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { companyName: { contains: filters.search, mode: "insensitive" } },
          ] } } },
        ],
      } : {}),
    },
    orderBy: [
      { goodReceivedNote: { receiptDate: "desc" } },
      { createdAt: "desc" },
    ],
    take: 2001,
    select: {
      id: true,
      productId: true,
      unitCost: true,
      acceptedQuantity: true,
      acceptedWeightKg: true,
      ratePerKg: true,
      lineAmount: true,
      product: { select: { name: true, sku: true, unit: true } },
      goodReceivedNote: {
        select: {
          id: true,
          grnNumber: true,
          receiptDate: true,
          supplier: { select: { id: true, name: true, companyName: true } },
          purchaseOrder: { select: { orderNumber: true } },
        },
      },
    },
  });

  const truncated = rows.length > 2000;
  const visible = rows.slice(0, 2000);
  const latestByProduct = new Map<string, number>();
  const result = visible.map((row) => {
    const unitCost = Number(row.unitCost);
    const previous = latestByProduct.get(row.productId) ?? null;
    latestByProduct.set(row.productId, unitCost);
    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      sku: row.product.sku ?? "",
      unit: row.product.unit,
      supplierId: row.goodReceivedNote.supplier.id,
      supplierName: row.goodReceivedNote.supplier.companyName ?? row.goodReceivedNote.supplier.name,
      grnId: row.goodReceivedNote.id,
      grnNumber: row.goodReceivedNote.grnNumber,
      purchaseOrderNumber: row.goodReceivedNote.purchaseOrder.orderNumber,
      receiptDate: row.goodReceivedNote.receiptDate.toISOString(),
      acceptedQuantity: Number(row.acceptedQuantity),
      acceptedWeightKg: row.acceptedWeightKg ? Number(row.acceptedWeightKg) : null,
      unitCost,
      ratePerKg: row.ratePerKg ? Number(row.ratePerKg) : null,
      lineAmount: row.lineAmount ? Number(row.lineAmount) : null,
      previousUnitCost: previous,
      changeFromPrevious: previous === null ? null : unitCost - previous,
      changePercent: previous && previous !== 0 ? ((unitCost - previous) / previous) * 100 : null,
    };
  });

  return { rows: result, truncated };
}
