import { z } from "zod";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { db } from "@/lib/server/db";

export const GET = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);

  const supplier = await db.supplier.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true } });
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");

  const purchases = await db.purchaseOrder.findMany({
    where: {
      workspaceId: context.workspaceId,
      supplierId: id,
      status: { not: "CANCELLED" },
      balanceAmount: { gt: 0 },
    },
    orderBy: { orderDate: "asc" },
    select: {
      id: true,
      orderNumber: true,
      orderDate: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
    },
  });

  return apiData(
    purchases.map((p) => ({
      id: p.id,
      orderNumber: p.orderNumber,
      orderDate: p.orderDate.toISOString(),
      totalAmount: Number(p.totalAmount),
      paidAmount: Number(p.paidAmount),
      balanceAmount: Number(p.balanceAmount),
    })),
  );
});
