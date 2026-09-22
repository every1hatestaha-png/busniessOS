import "server-only";

import type { Role } from "@prisma/client";

import {
  fbrReferenceDate,
  fetchFbrProvinces,
  fetchFbrRates,
  fetchFbrTransactionTypes,
  fetchFbrUoms,
  plainPercentageRate,
} from "@/lib/fbr/reference";
import { canPerformAction } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { resolveFbrBearerTokenForRequest } from "@/lib/server/fbr-credentials";

type ReferenceContext = { workspaceId: string; role: Role };

export class FbrReferenceOptionsError extends Error {}

function normalized(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

export async function getFbrReferenceOptions(
  context: ReferenceContext,
  transactionTypeId?: number,
  now = new Date(),
) {
  if (!canPerformAction(context.role, "products.write")) {
    throw new FbrReferenceOptionsError("You do not have permission to load FBR product references.");
  }

  const workspace = await db.workspace.findUnique({
    where: { id: context.workspaceId },
    select: { province: true, timezone: true },
  });
  if (!workspace) throw new FbrReferenceOptionsError("Workspace not found.");
  if (!workspace.province?.trim()) {
    throw new FbrReferenceOptionsError("Add the seller province in business settings before loading FBR rates.");
  }

  const { token } = await resolveFbrBearerTokenForRequest(context.workspaceId, "SANDBOX");
  const [provinces, transactionTypes, uoms] = await Promise.all([
    fetchFbrProvinces(token),
    fetchFbrTransactionTypes(token),
    fetchFbrUoms(token),
  ]);

  const province = provinces.find((entry) => normalized(entry.description) === normalized(workspace.province));
  if (!province) {
    throw new FbrReferenceOptionsError(
      `Seller province "${workspace.province}" was not found in the current FBR province reference list.`,
    );
  }

  const effectiveDate = fbrReferenceDate(now, workspace.timezone || "Asia/Karachi");
  let rates: Array<{ id: number; description: string; value: number; plainPercentage: boolean }> = [];
  let rateTransactionTypeId: number | null = null;

  if (transactionTypeId) {
    const transactionType = transactionTypes.find((entry) => entry.id === transactionTypeId);
    if (!transactionType) {
      throw new FbrReferenceOptionsError("The selected FBR transaction type is not present in the current reference list.");
    }
    const currentRates = await fetchFbrRates({
      token,
      date: effectiveDate,
      transactionTypeId,
      supplierProvinceCode: province.code,
    });
    rates = currentRates
      .map((rate) => ({
        ...rate,
        plainPercentage: plainPercentageRate(rate.description, rate.value),
      }))
      .sort((a, b) => a.value - b.value || a.description.localeCompare(b.description));
    rateTransactionTypeId = transactionTypeId;
  }

  return {
    province,
    effectiveDate,
    transactionTypes: [...transactionTypes].sort((a, b) => a.description.localeCompare(b.description)),
    uoms: [...uoms].sort((a, b) => a.description.localeCompare(b.description)),
    rates,
    rateTransactionTypeId,
  };
}
