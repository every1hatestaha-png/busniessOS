"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import {
  closeCashShift,
  createKitchenTicket,
  createRecipe,
  createRestaurantTable,
  IndustryDomainError,
  openCashShift,
  updateKitchenTicketStatus,
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


type RecipeItemInput = { ingredientProductId?: unknown; quantity?: unknown; wastagePercent?: unknown };

export async function createRecipeAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const finishedProductId = String(formData.get("finishedProductId") ?? "").trim();
  const yieldQuantity = Number(formData.get("yieldQuantity") ?? 1);
  const notes = String(formData.get("notes") ?? "").trim();

  let rawItems: RecipeItemInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
    if (!Array.isArray(parsed)) return fail("Recipe ingredients are invalid.");
    rawItems = parsed;
  } catch {
    return fail("Recipe ingredients are invalid.");
  }

  if (!/^[0-9a-f-]{36}$/i.test(finishedProductId)) return fail("Choose a finished product.");
  if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0 || yieldQuantity > 1_000_000_000) return fail("Recipe yield must be positive.");
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");
  if (rawItems.length < 1 || rawItems.length > 100) return fail("Add between 1 and 100 ingredients.");

  const items = rawItems.map((item) => ({
    ingredientProductId: String(item.ingredientProductId ?? "").trim(),
    quantity: Number(item.quantity ?? 0),
    wastagePercent: Number(item.wastagePercent ?? 0),
  }));
  const seen = new Set<string>();
  for (const item of items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.ingredientProductId)) return fail("Choose a product for every ingredient.");
    if (item.ingredientProductId === finishedProductId) return fail("The finished product cannot be its own ingredient.");
    if (seen.has(item.ingredientProductId)) return fail("Each ingredient can appear only once.");
    seen.add(item.ingredientProductId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return fail("Every ingredient quantity must be positive.");
    if (!Number.isFinite(item.wastagePercent) || item.wastagePercent < 0 || item.wastagePercent > 100) return fail("Ingredient wastage must be between 0% and 100%.");
  }

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createRecipe(
      { workspaceId, role, userId: user.id },
      { finishedProductId, yieldQuantity, notes: notes || undefined, items },
    );
    revalidatePath("/restaurant");
    return { status: "success", message: "Recipe saved and connected to inventory consumption." };
  } catch (error) {
    return fail(messageFor(error, "We could not save this recipe. Check the selected products and try again."));
  }
}

export async function createKitchenTicketAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const ticketNumber = String(formData.get("ticketNumber") ?? "").trim();
  const salesOrderId = String(formData.get("salesOrderId") ?? "").trim();
  const restaurantTableId = String(formData.get("restaurantTableId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (ticketNumber.length < 1 || ticketNumber.length > 80) return fail("Ticket number must be 1–80 characters.");
  if (salesOrderId && !/^[0-9a-f-]{36}$/i.test(salesOrderId)) return fail("Choose a valid sales order.");
  if (restaurantTableId && !/^[0-9a-f-]{36}$/i.test(restaurantTableId)) return fail("Choose a valid restaurant table.");
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createKitchenTicket(
      { workspaceId, role, userId: user.id },
      {
        ticketNumber,
        salesOrderId: salesOrderId || undefined,
        restaurantTableId: restaurantTableId || undefined,
        notes: notes || undefined,
      },
    );
    revalidatePath("/restaurant");
    return { status: "success", message: `Kitchen ticket ${ticketNumber} queued.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this kitchen ticket. Check the ticket number, sale, and table."));
  }
}

export async function updateKitchenTicketStatusAction(
  _previous: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return fail("Kitchen ticket is invalid.");
  if (!["PREPARING", "READY", "SERVED", "CANCELLED"].includes(status)) return fail("Kitchen ticket status is invalid.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await updateKitchenTicketStatus(
      { workspaceId, role, userId: user.id },
      ticketId,
      status as "PREPARING" | "READY" | "SERVED" | "CANCELLED",
    );
    revalidatePath("/restaurant");
    return { status: "success", message: `Kitchen ticket moved to ${status.toLowerCase()}.` };
  } catch (error) {
    return fail(messageFor(error, "We could not update this kitchen ticket."));
  }
}
