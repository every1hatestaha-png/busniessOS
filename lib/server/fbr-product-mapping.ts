import "server-only";

import { Prisma, type Role } from "@prisma/client";

import {
  fbrReferenceDate,
  fetchFbrProvinces,
  fetchFbrRates,
  fetchFbrTransactionTypes,
  fetchFbrUoms,
  plainPercentageRate,
} from "@/lib/fbr/reference";
import { canPerformAction } from "@/lib/server/authorization";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { resolveFbrBearerToken } from "@/lib/server/fbr-credentials";

type MappingContext = { workspaceId: string; role: Role; userId?: string };

export class FbrProductMappingError extends Error {}

function normalized(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function dateOnly(value: string) {
  const match = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) throw new FbrProductMappingError("FBR returned an invalid reference date.");
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const month = months[match[2]!.toUpperCase()];
  if (!month) throw new FbrProductMappingError("FBR returned an invalid reference month.");
  return new Date(`${match[3]}-${month}-${match[1]}T00:00:00.000Z`);
}

export async function verifyProductFbrReferenceMapping(
  context: MappingContext,
  productId: string,
  now = new Date(),
) {
  if (!canPerformAction(context.role, "products.write")) {
    throw new FbrProductMappingError("You do not have permission to verify product FBR mappings.");
  }

  const [product, workspace] = await Promise.all([
    db.product.findFirst({
      where: { id: productId, workspaceId: context.workspaceId },
      select: {
        id: true,
        name: true,
        fbrHsCode: true,
        fbrUom: true,
        fbrTransactionTypeId: true,
        fbrRateId: true,
      },
    }),
    db.workspace.findUnique({
      where: { id: context.workspaceId },
      select: { province: true, timezone: true },
    }),
  ]);
  if (!product) throw new FbrProductMappingError("Product not found.");
  if (!workspace) throw new FbrProductMappingError("Workspace not found.");
  if (!product.fbrHsCode?.trim()) throw new FbrProductMappingError("Add the FBR HS code before verification.");
  if (!product.fbrUom?.trim()) throw new FbrProductMappingError("Add the FBR unit of measurement before verification.");
  if (!product.fbrTransactionTypeId) throw new FbrProductMappingError("Add the FBR transaction type ID before verification.");
  if (!product.fbrRateId) throw new FbrProductMappingError("Add the FBR rate ID before verification.");
  if (!workspace.province?.trim()) throw new FbrProductMappingError("Add the seller province in business settings before verification.");

  const { token } = resolveFbrBearerToken(context.workspaceId, "SANDBOX");
  const [provinces, transactionTypes, uoms] = await Promise.all([
    fetchFbrProvinces(token),
    fetchFbrTransactionTypes(token),
    fetchFbrUoms(token),
  ]);

  const province = provinces.find((entry) => normalized(entry.description) === normalized(workspace.province));
  if (!province) throw new FbrProductMappingError(`Seller province "${workspace.province}" was not found in the current FBR province reference list.`);

  const transactionType = transactionTypes.find((entry) => entry.id === product.fbrTransactionTypeId);
  if (!transactionType) throw new FbrProductMappingError("The selected FBR transaction type ID is not present in the current reference list.");

  const uom = uoms.find((entry) => normalized(entry.description) === normalized(product.fbrUom));
  if (!uom) throw new FbrProductMappingError("The entered FBR unit of measurement is not present in the current reference list.");

  const effectiveDate = fbrReferenceDate(now, workspace.timezone || "Asia/Karachi");
  const rates = await fetchFbrRates({
    token,
    date: effectiveDate,
    transactionTypeId: transactionType.id,
    supplierProvinceCode: province.code,
  });
  const rate = rates.find((entry) => entry.id === product.fbrRateId);
  if (!rate) {
    const available = rates.slice(0, 6).map((entry) => `${entry.id} — ${entry.description}`).join("; ");
    throw new FbrProductMappingError(
      available
        ? `The selected FBR rate ID is not valid for this transaction type, date and province. Current options: ${available}`
        : "FBR returned no valid rates for this transaction type, date and province.",
    );
  }

  const verifiedAt = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        workspaceId: context.workspaceId,
        fbrHsCode: product.fbrHsCode,
        fbrUom: product.fbrUom,
        fbrTransactionTypeId: product.fbrTransactionTypeId,
        fbrRateId: product.fbrRateId,
      },
      data: {
        fbrUomId: uom.id,
        fbrTransactionTypeDesc: transactionType.description,
        fbrRateDesc: rate.description,
        fbrRateValue: new Prisma.Decimal(rate.value),
        fbrReferenceVerifiedAt: verifiedAt,
        fbrReferenceVerifiedForDate: dateOnly(effectiveDate),
        fbrReferenceProvinceCode: province.code,
        fbrReferenceProvinceDesc: province.description,
      },
    });
    if (updated.count !== 1) {
      throw new FbrProductMappingError("The product FBR mapping changed during verification. Refresh the product and verify again.");
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "product.fbr_mapping_verified",
      entityType: "Product",
      entityId: product.id,
      metadata: {
        hsCode: product.fbrHsCode,
        uom: product.fbrUom,
        uomId: uom.id,
        transactionTypeId: transactionType.id,
        transactionTypeDesc: transactionType.description,
        rateId: rate.id,
        rateDesc: rate.description,
        rateValue: rate.value,
        provinceCode: province.code,
        provinceDesc: province.description,
        effectiveDate,
        plainPercentageRate: plainPercentageRate(rate.description, rate.value),
      },
    });
  });

  return {
    transactionType,
    rate,
    uom,
    province,
    effectiveDate,
    plainPercentageRate: plainPercentageRate(rate.description, rate.value),
  };
}
