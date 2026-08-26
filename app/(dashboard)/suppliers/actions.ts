"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { createSupplier, updateSupplier } from "@/lib/server/suppliers";
import { supplierSchema, type SupplierInput } from "@/lib/validation/supplier";

export type SupplierFormState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof SupplierInput, string[]>>;
};

function collectFieldErrors(issues: { path: PropertyKey[]; message: string }[]): SupplierFormState["fieldErrors"] {
  const fieldErrors: SupplierFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const field = issue.path[0] as keyof SupplierInput | undefined;
    if (field) fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return fieldErrors;
}

export async function createSupplierAction(
  _previousState: SupplierFormState,
  input: SupplierInput,
): Promise<SupplierFormState> {
  const context = await requirePermission("financial.manage");
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { message: "Please correct the highlighted fields.", fieldErrors: collectFieldErrors(parsed.error.issues) };

  let supplierId: string;
  try {
    const supplier = await createSupplier({ workspaceId: context.workspaceId, role: context.role, userId: context.user.id }, parsed.data);
    supplierId = supplier.id;
  } catch {
    return { message: "We could not save this supplier. Please try again." };
  }

  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplierId}`);
}

export async function updateSupplierAction(
  id: string,
  _previousState: SupplierFormState,
  input: SupplierInput,
): Promise<SupplierFormState> {
  const context = await requirePermission("financial.manage");
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { message: "Please correct the highlighted fields.", fieldErrors: collectFieldErrors(parsed.error.issues) };

  try {
    await updateSupplier({ workspaceId: context.workspaceId, role: context.role, userId: context.user.id }, id, parsed.data);
  } catch {
    return { message: "We could not update this supplier. Please try again." };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  redirect(`/suppliers/${id}`);
}
