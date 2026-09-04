"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { createCustomer, CustomerDomainError, updateCustomer } from "@/lib/server/customers";
import {
  customerEditSchema,
  customerSchema,
  type CustomerEditInput,
  type CustomerInput,
} from "@/lib/validation/customer";

export type CreateCustomerState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof CustomerInput, string[]>>;
};

export async function createCustomerAction(
  _previousState: CreateCustomerState,
  input: CustomerInput,
): Promise<CreateCustomerState> {
  const context = await requirePermission("customers.write");
  const parsed = customerSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: CreateCustomerState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CustomerInput | undefined;
      if (field) fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return { message: "Please correct the highlighted fields.", fieldErrors };
  }

  let customerId: string;
  try {
    customerId = await createCustomer(context.workspaceId, parsed.data);
  } catch {
    return { message: "We could not save this customer. Please try again." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${customerId}`);
}

export async function updateCustomerAction(
  id: string,
  _previousState: CreateCustomerState,
  input: CustomerEditInput,
): Promise<CreateCustomerState> {
  const context = await requirePermission("customers.write");
  const parsed = customerEditSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: CreateCustomerState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CustomerEditInput | undefined;
      if (field) fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return { message: "Please correct the highlighted fields.", fieldErrors };
  }

  try {
    await updateCustomer({ ...context, userId: context.user.id }, id, parsed.data);
  } catch (error) {
    if (error instanceof CustomerDomainError) return { message: error.message };
    return { message: "We could not update this customer. Please try again." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}
