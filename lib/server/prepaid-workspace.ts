import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/auth";
import { assertPlatformMfaEnabled } from "@/lib/server/platform-security";
import { MIN_INITIAL_PAYMENT_PKR } from "@/lib/saas/payment-first";

/**
 * Read-only entitlement lookup for the customer's onboarding page.
 * Core workspace provisioning independently locks and consumes the approval.
 */
export async function hasVerifiedUnconsumedPayment(userId: string) {
  const approvals = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "prepaid_workspace_approvals"
    WHERE "userId" = ${userId} AND "consumedWorkspaceId" IS NULL AND "consumedAt" IS NULL
      AND "verifiedAmountPkr" >= ${MIN_INITIAL_PAYMENT_PKR}
    LIMIT 1
  `;
  return approvals.length > 0;
}

/**
 * OFFLINE/OWNER-VERIFIED ONLY. The owner must first independently match the
 * credited transfer against their bank/merchant statement. This endpoint
 * does not accept customer proof as evidence and cannot charge a card.
 */
export async function approveVerifiedManualPayment(input: {
  customerEmail: string;
  paymentReference: string;
  verifiedAmountPkr: number;
}) {
  await assertPlatformMfaEnabled();
  const actor = await getCurrentUser();
  const email = input.customerEmail.trim().toLowerCase();
  const reference = input.paymentReference.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter the exact email address of a registered customer.");
  }
  if (reference.length < 8 || reference.length > 128 || !/^[A-Za-z0-9._:/-]+$/.test(reference)) {
    throw new Error("Enter a valid bank-verified transaction reference (8–128 characters).");
  }
  if (!Number.isSafeInteger(input.verifiedAmountPkr) || input.verifiedAmountPkr < MIN_INITIAL_PAYMENT_PKR) {
    throw new Error(`Initial payment must be at least PKR ${MIN_INITIAL_PAYMENT_PKR.toLocaleString("en-PK")}.`);
  }

  const customer = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!customer) throw new Error("No verified MunshiOS account exists for that customer email.");

  await db.$executeRaw`
    INSERT INTO "prepaid_workspace_approvals"
      ("id", "userId", "paymentReference", "verifiedAmountPkr", "planCode",
       "billingCycle", "verifiedByUserId")
    VALUES
      (${`prepaid_${randomUUID().replaceAll("-", "")}`}, ${customer.id},
       ${reference}, ${input.verifiedAmountPkr}, 'starter', 'monthly', ${actor.id})
  `;
}
