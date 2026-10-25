"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import { assertRestaurantMutationAccess } from "@/lib/server/restaurant-mutation-access";
import { setRestaurantStaffStation } from "@/lib/server/restaurant-stations";

export async function assignRestaurantStaffStationAction(formData: FormData) {
  const actor = await requireWorkspace();
  if (formData.get("formWorkspaceId") !== actor.workspaceId) {
    return { status: "error" as const, message: "Your workspace changed. Refresh before continuing." };
  }
  try {
    await assertRestaurantMutationAccess(actor.workspaceId);
    const raw = String(formData.get("station") ?? "");
    if (!["NONE", "CASHIER", "KITCHEN"].includes(raw)) {
      return { status: "error" as const, message: "Choose a valid station." };
    }
    await setRestaurantStaffStation({
      workspaceId: actor.workspaceId, userId: actor.user.id, role: actor.role,
    }, String(formData.get("userId") ?? ""), raw === "NONE" ? null : raw as "CASHIER" | "KITCHEN");
    revalidatePath("/restaurant/manager/staff");
    revalidatePath("/restaurant/manager");
    revalidatePath("/restaurant");
    return { status: "success" as const, message: "Staff station access updated." };
  } catch {
    return { status: "error" as const, message: "Station assignment was rejected. Check your permissions and staff membership." };
  }
}
