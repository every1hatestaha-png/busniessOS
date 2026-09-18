"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import {
  closeCashShift,
  createRestaurantTable,
  IndustryDomainError,
  openCashShift,
} from "@/lib/server/industry-modules";

export type RestaurantActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialRestaurantActionState: RestaurantActionState = { status: "idle", message: "" };

function fail(message: string): RestaurantActionState {
  return { status: "error", message };
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof IndustryDomainError ? error.message : fallback;
}

export async function createRestaurantTableAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const capacity = Number(formData.get("capacity") ?? 0);

  if (name.length < 1 || name.length > 80) return fail("Enter a table name up to 80 characters.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail("Capacity must be a whole number from 1 to 100.");
  if (area.length > 80) return fail("Area must be 80 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createRestaurantTable(
      { workspaceId, role, userId: user.id },
      { name, capacity, area: area || undefined },
    );
    revalidatePath("/restaurant");
    return { status: "success", message: `${name} added successfully.` };
  } catch (error) {
    return fail(messageFor(error, "We could not add this table. Check for a duplicate name and try again."));
  }
}

export async function openCashShiftAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const openingCash = Number(formData.get("openingCash") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();
  if (!Number.isFinite(openingCash) || openingCash < 0 || openingCash > 1_000_000_000) {
    return fail("Opening cash must be a valid non-negative amount.");
  }
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await openCashShift({ workspaceId, role, userId: user.id }, openingCash, notes || undefined);
    revalidatePath("/restaurant");
    return { status: "success", message: "Cash shift opened." };
  } catch (error) {
    return fail(messageFor(error, "We could not open the cash shift. Make sure another shift is not already open."));
  }
}

export async function closeCashShiftAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const shiftId = String(formData.get("shiftId") ?? "").trim();
  const closingCash = Number(formData.get("closingCash") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(shiftId)) return fail("The open cash shift could not be identified.");
  if (!Number.isFinite(closingCash) || closingCash < 0 || closingCash > 1_000_000_000) {
    return fail("Closing cash must be a valid non-negative amount.");
  }
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    const result = await closeCashShift({ workspaceId, role, userId: user.id }, shiftId, closingCash, notes || undefined);
    revalidatePath("/restaurant");
    return {
      status: "success",
      message: `Shift closed. Cash variance: Rs ${result.variance.toLocaleString()}.`,
    };
  } catch (error) {
    return fail(messageFor(error, "We could not close the cash shift. Refresh the page and try again."));
  }
}
