"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import { reverseRestaurantItemReturn } from "@/lib/server/restaurant-return-reversals";

export async function reverseRestaurantReturnAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const returnId = String(formData.get("returnId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const workspace = await requireWorkspace();

  await reverseRestaurantItemReturn(
    { workspaceId: workspace.workspaceId, role: workspace.role, userId: workspace.user.id },
    returnId,
    reason,
  );

  for (const path of [
    "/restaurant",
    "/restaurant/orders",
    `/restaurant/orders/${orderId}/return`,
  ]) revalidatePath(path);
}
