"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { CustomerSalesBomError, deleteCustomerSalesBom, saveCustomerSalesBom } from "@/lib/server/customer-sales-bom";

function target(customerId: string, kind: "success" | "error", message: string) {
  return `/customers/${customerId}/products?${kind}=${encodeURIComponent(message)}`;
}

export async function saveCustomerSalesBomAction(customerId: string, formData: FormData) {
  const context = await requirePermission("customers.write");
  const productId = String(formData.get("productId") ?? "");
  const productCode = String(formData.get("productCode") ?? "");
  const componentProductIds = formData.getAll("componentProductId").map(String);
  const quantities = formData.getAll("quantityPerUnit").map((value) => Number(value));

  if (!productId || componentProductIds.length !== quantities.length) {
    redirect(target(customerId, "error", "Choose a sale product and valid component quantities."));
  }

  try {
    await saveCustomerSalesBom(
      { workspaceId: context.workspaceId, role: context.role, userId: context.user.id },
      customerId,
      {
        productId,
        productCode,
        components: componentProductIds.map((componentProductId, index) => ({
          componentProductId,
          quantityPerUnit: quantities[index]!,
        })),
      },
    );
  } catch (error) {
    const message = error instanceof CustomerSalesBomError ? error.message : "Customer product configuration could not be saved.";
    redirect(target(customerId, "error", message));
  }

  revalidatePath(`/customers/${customerId}/edit`);
  revalidatePath(`/customers/${customerId}/products`);
  redirect(target(customerId, "success", "Customer product components saved."));
}

export async function deleteCustomerSalesBomAction(customerId: string, bomId: string) {
  const context = await requirePermission("customers.write");
  try {
    await deleteCustomerSalesBom(
      { workspaceId: context.workspaceId, role: context.role, userId: context.user.id },
      customerId,
      bomId,
    );
  } catch (error) {
    const message = error instanceof CustomerSalesBomError ? error.message : "Customer product configuration could not be archived.";
    redirect(target(customerId, "error", message));
  }
  revalidatePath(`/customers/${customerId}/products`);
  redirect(target(customerId, "success", "Customer product configuration archived."));
}
