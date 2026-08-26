"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/lib/server/auth";
import { createCustomer } from "@/lib/server/customers";
import { customerSchema, type CustomerInput } from "@/lib/validation/customer";

export type CreateCustomerState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof CustomerInput, string[]>>;
};

export async function createCustomerAction(
  _previousState: CreateCustomerState,
  input: CustomerInput,
): Promise<CreateCustomerState> {
  const { workspaceId } = await requireWorkspace();
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
    customerId = await createCustomer(workspaceId, parsed.data);
  } catch {
    return { message: "We could not save this customer. Please try again." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${customerId}`);
}
