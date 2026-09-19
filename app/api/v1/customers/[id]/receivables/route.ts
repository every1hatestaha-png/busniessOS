import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { db } from "@/lib/server/db";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);

  const customer = await db.customer.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, currentBalance: true },
  });
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");

  const invoices = await db.invoice.findMany({
    where: {
      workspaceId: context.workspaceId,
      customerId: id,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      amount: true,
      paidAmount: true,
      creditApplied: true,
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  return apiData({
    customerId: customer.id,
    currentBalance: Number(customer.currentBalance),
    invoices: invoices
      .map((invoice) => {
        const outstandingAmount = new Prisma.Decimal(invoice.amount).minus(invoice.paidAmount).minus(invoice.creditApplied);
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          issuedAt: invoice.issuedAt.toISOString(),
          originalAmount: Number(invoice.amount),
          paidAmount: Number(invoice.paidAmount),
          creditApplied: Number(invoice.creditApplied),
          outstandingAmount: outstandingAmount.toNumber(),
        };
      })
      .filter((invoice) => invoice.outstandingAmount > 0),
  });
});
