"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import {
  CustomerPriceRuleError,
  customerPriceRuleSchema,
  deleteCustomerPriceRule,
  saveCustomerPriceRule,
} from "@/lib/server/customer-pricing";

function pricingRedirect(customerId: string, kind: "success" | "error", message: string): never {
  redirect(`/customers/${customerId}/pricing?${kind}=${encodeURIComponent(message)}`);
}

export async function saveCustomerPriceRuleAction(customerId: string, formData: FormData) {
  const context = await requirePermission("customers.write");
  const parsed = customerPriceRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) pricingRedirect(customerId, "error", parsed.error.issues[0]?.message ?? "Check the price tier.");

  try {
    await saveCustomerPriceRule({ ...context, userId: context.user.id }, customerId, parsed.data);
  } catch (error) {
    pricingRedirect(customerId, "error", error instanceof CustomerPriceRuleError ? error.message : "Price tier could not be saved.");
  }

  revalidatePath(`/customers/${customerId}/pricing`);
  revalidatePath("/sales/new");
  pricingRedirect(customerId, "success", "Customer price tier saved.");
}

export async function deleteCustomerPriceRuleAction(customerId: string, id: string) {
  const context = await requirePermission("customers.write");
  try {
    await deleteCustomerPriceRule({ ...context, userId: context.user.id }, customerId, id);
  } catch (error) {
    pricingRedirect(customerId, "error", error instanceof CustomerPriceRuleError ? error.message : "Price tier could not be deleted.");
  }

  revalidatePath(`/customers/${customerId}/pricing`);
  revalidatePath("/sales/new");
  pricingRedirect(customerId, "success", "Customer price tier deleted.");
}
