import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { writeAudit } from "@/lib/server/audit";
import { canPerformAction } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";

export const customerPriceRuleSchema = z.object({
  productId: z.string().uuid(),
  minQuantity: z.coerce.number().positive().max(100000000),
  unitPrice: z.coerce.number().min(0).max(1000000000),
  discountPerUnit: z.coerce.number().min(0).max(1000000000).default(0),
});

export class CustomerPriceRuleError extends Error {}

export async function listCustomerPriceRules(workspaceId: string, customerId?: string) {
  const rows = await db.customerPriceRule.findMany({
    where: { workspaceId, ...(customerId ? { customerId } : {}) },
    orderBy: [{ product: { name: "asc" } }, { minQuantity: "asc" }],
    include: { product: { select: { name: true, sku: true, sellingPrice: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    productId: row.productId,
    productName: row.product.name,
    sku: row.product.sku ?? "",
    defaultSellingPrice: Number(row.product.sellingPrice),
    minQuantity: Number(row.minQuantity),
    unitPrice: Number(row.unitPrice),
    discountPerUnit: Number(row.discountPerUnit),
    isActive: row.isActive,
  }));
}

export async function saveCustomerPriceRule(
  context: ServiceContext,
  customerId: string,
  input: z.input<typeof customerPriceRuleSchema>,
) {
  if (!canPerformAction(context.role, "customers.write")) throw new CustomerPriceRuleError("Unauthorized.");
  const data = customerPriceRuleSchema.parse(input);
  const minQuantity = new Prisma.Decimal(data.minQuantity);
  const unitPrice = new Prisma.Decimal(data.unitPrice);
  const discountPerUnit = new Prisma.Decimal(data.discountPerUnit);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, workspaceId: context.workspaceId }, select: { id: true } });
    const product = await tx.product.findFirst({ where: { id: data.productId, workspaceId: context.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!customer) throw new CustomerPriceRuleError("Customer not found.");
    if (!product) throw new CustomerPriceRuleError("Product not found.");
    if (discountPerUnit.greaterThan(unitPrice)) throw new CustomerPriceRuleError("Discount per unit cannot exceed the tier unit price.");

    const rule = await tx.customerPriceRule.upsert({
      where: {
        workspaceId_customerId_productId_minQuantity: {
          workspaceId: context.workspaceId,
          customerId,
          productId: data.productId,
          minQuantity,
        },
      },
      update: { unitPrice, discountPerUnit, isActive: true },
      create: {
        workspaceId: context.workspaceId,
        customerId,
        productId: data.productId,
        minQuantity,
        unitPrice,
        discountPerUnit,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_price_rule.saved",
      entityType: "CustomerPriceRule",
      entityId: rule.id,
      metadata: {
        customerId,
        productId: data.productId,
        minQuantity: minQuantity.toString(),
        unitPrice: unitPrice.toString(),
        discountPerUnit: discountPerUnit.toString(),
      },
    });
    return rule;
  });
}

export async function deleteCustomerPriceRule(context: ServiceContext, customerId: string, id: string) {
  if (!canPerformAction(context.role, "customers.write")) throw new CustomerPriceRuleError("Unauthorized.");
  return db.$transaction(async (tx) => {
    const rule = await tx.customerPriceRule.findFirst({
      where: { id, workspaceId: context.workspaceId, customerId },
      select: { id: true, productId: true, minQuantity: true },
    });
    if (!rule) throw new CustomerPriceRuleError("Price rule not found.");
    await tx.customerPriceRule.delete({ where: { id: rule.id } });
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_price_rule.deleted",
      entityType: "CustomerPriceRule",
      entityId: rule.id,
      metadata: { customerId, productId: rule.productId, minQuantity: rule.minQuantity.toString() },
    });
  });
}
