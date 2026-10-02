"use server";

import type { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

import type { RestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import { requireWorkspace } from "@/lib/server/auth";
import { restaurantActionErrorMessage, restaurantMutationFeedback, restaurantFormWorkspaceChanged } from "@/lib/server/restaurant-action-errors";
import {
  transitionRestaurantOrderWithIntegrity,
  voidRestaurantPayment,
} from "@/lib/server/restaurant-integrity";
import { createRestaurantItemReturn } from "@/lib/server/restaurant-item-returns";
import { recordRestaurantPaymentAtCollection } from "@/lib/server/restaurant-payments-immediate";
import { prepareRestaurantSingleItemReturn } from "@/lib/server/restaurant-return-ui";
import {
  confirmRestaurantOrder,
  createPosRestaurantOrder,
  createRestaurantMenuCategory,
  createRestaurantMenuItem,
  setRestaurantMenuItemAvailability,
  type RestaurantFulfillmentType,
  type RestaurantOrderLineInput,
  type RestaurantOrderStatus,
} from "@/lib/server/restaurant-workspace";

function fail(message: string): RestaurantV1ActionState {
  return { status: "error", message };
}

function messageFor(error: unknown, fallback: string) {
  return restaurantActionErrorMessage(error, fallback);
}

function refreshRestaurant(orderId?: string) {
  for (const path of [
    "/restaurant",
    "/restaurant/pos",
    "/restaurant/orders",
    "/restaurant/kitchen",
    "/restaurant/menu",
    "/restaurant/whatsapp",
  ]) revalidatePath(path);
  if (orderId) revalidatePath(`/restaurant/orders/${orderId}/return`);
}

function contextFrom(workspace: Awaited<ReturnType<typeof requireWorkspace>>) {
  return { workspaceId: workspace.workspaceId, role: workspace.role, userId: workspace.user.id };
}

function canManageRestaurant(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export async function createMenuCategoryAction(
  _previous: RestaurantV1ActionState,
  formData: FormData,
): Promise<RestaurantV1ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  if (!name || name.length > 80) return fail("Category name must be 1-80 characters.");
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) return fail("Category order is invalid.");
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  try {
    await createRestaurantMenuCategory(contextFrom(workspace), { name, sortOrder });
    refreshRestaurant();
    return { status: "success", message: `${name} added to the menu.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this menu category."));
  }
}

export async function createMenuItemAction(
  _previous: RestaurantV1ActionState,
  formData: FormData,
): Promise<RestaurantV1ActionState> {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const price = Number(formData.get("price") ?? NaN);
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  if (!categoryId) return fail("Choose a menu category.");
  if (!name || name.length > 120) return fail("Menu item name must be 1-120 characters.");
  if (!Number.isFinite(price) || price < 0) return fail("Enter a valid menu price.");
  if (description.length > 500) return fail("Description must be 500 characters or fewer.");
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) return fail("Menu item order is invalid.");
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  try {
    await createRestaurantMenuItem(contextFrom(workspace), {
      categoryId,
      productId: productId || undefined,
      name,
      description: description || undefined,
      price,
      sortOrder,
    });
    refreshRestaurant();
    return { status: "success", message: `${name} added to the menu.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this menu item."));
  }
}

export async function setMenuItemAvailabilityAction(formData: FormData) {
  const menuItemId = String(formData.get("menuItemId") ?? "").trim();
  const isAvailable = String(formData.get("isAvailable") ?? "") === "true";
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  if (!canManageRestaurant(workspace.role)) return fail("Manager access is required to change menu availability.");
  return restaurantMutationFeedback(async () => {
    await setRestaurantMenuItemAvailability(contextFrom(workspace), menuItemId, isAvailable);
    refreshRestaurant();
  }, "Menu availability updated.", "We could not update menu availability. Refresh the menu before trying again.");
}

type RawCartLine = { menuItemId?: unknown; quantity?: unknown; notes?: unknown; modifiers?: unknown };

function parseCart(formData: FormData): RestaurantOrderLineInput[] {
  let raw: RawCartLine[];
  try {
    const parsed = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    raw = parsed;
  } catch {
    throw new Error("The order cart is invalid.");
  }
  return raw.map((line) => ({
    menuItemId: String(line.menuItemId ?? "").trim(),
    quantity: Number(line.quantity ?? 0),
    notes: typeof line.notes === "string" ? line.notes : undefined,
    modifiers: Array.isArray(line.modifiers) ? line.modifiers.map(String) : undefined,
  }));
}


export async function createPosOrderAction(
  _previous: RestaurantV1ActionState,
  formData: FormData,
): Promise<RestaurantV1ActionState> {
  let items: RestaurantOrderLineInput[];
  try {
    items = parseCart(formData);
  } catch {
    return fail("The order cart is invalid.");
  }
  const fulfillmentType = String(formData.get("fulfillmentType") ?? "TAKEAWAY") as RestaurantFulfillmentType;
  if (!["DINE_IN", "TAKEAWAY", "DELIVERY"].includes(fulfillmentType)) return fail("Order type is invalid.");
  const restaurantTableId = String(formData.get("restaurantTableId") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const deliveryAddress = String(formData.get("deliveryAddress") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const discountAmount = Number(formData.get("discountAmount") ?? 0);
  const taxAmount = Number(formData.get("taxAmount") ?? 0);
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  try {
    const order = await createPosRestaurantOrder(contextFrom(workspace), {
      fulfillmentType,
      restaurantTableId: restaurantTableId || undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      deliveryAddress: deliveryAddress || undefined,
      notes: notes || undefined,
      discountAmount,
      taxAmount,
      items,
    });
    refreshRestaurant();
    return { status: "success", message: `${order.orderNumber} confirmed and sent to the kitchen.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this restaurant order."));
  }
}

export async function confirmRestaurantOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  return restaurantMutationFeedback(async () => {
    await confirmRestaurantOrder(contextFrom(workspace), orderId);
    refreshRestaurant();
  }, "Order confirmed.", "We could not confirm this order. Refresh its status before trying again.");
}

export async function transitionRestaurantOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "") as RestaurantOrderStatus;
  if (!["PENDING_REVIEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(nextStatus)) {
    return fail("Restaurant order status is invalid.");
  }
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  return restaurantMutationFeedback(async () => {
    await transitionRestaurantOrderWithIntegrity(contextFrom(workspace), orderId, nextStatus);
    refreshRestaurant();
  }, "Order updated.", "We could not update this order. Refresh its status before trying again.");
}

export async function setRestaurantOrderPaymentStatusAction() {
  return fail("Manual payment status changes are disabled. Record an actual restaurant payment instead.");
}

export async function recordRestaurantPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const cashBankAccountId = String(formData.get("cashBankAccountId") ?? "").trim();
  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;
  const amount = Number(formData.get("amount") ?? NaN);
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const idempotencyKey = String(formData.get("paymentRequestId") ?? "").trim();
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  return restaurantMutationFeedback(async () => {
    await recordRestaurantPaymentAtCollection(contextFrom(workspace), {
      orderId,
      cashBankAccountId,
      method,
      amount,
      reference: reference || undefined,
      notes: notes || undefined,
      idempotencyKey: idempotencyKey || undefined,
    });
    refreshRestaurant();
  }, "Payment recorded.", "We could not record this payment. Check payment history before trying again.");
}

export async function voidRestaurantPaymentAction(formData: FormData) {
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  return restaurantMutationFeedback(async () => {
    await voidRestaurantPayment(contextFrom(workspace), paymentId, reason);
    refreshRestaurant();
  }, "Payment voided.", "We could not void this payment. Refresh payment history before trying again.");
}

export async function createRestaurantItemReturnAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const returnQuantity = Number(formData.get("returnQuantity") ?? NaN);
  const reason = String(formData.get("reason") ?? "").trim();
  const restock = String(formData.get("restock") ?? "") === "true";
  const requestId = String(formData.get("returnRequestId") ?? "").trim();
  const workspace = await requireWorkspace();
  if (restaurantFormWorkspaceChanged(formData, workspace.workspaceId)) return fail("Your workspace changed. Refresh this page before submitting.");
  if (!canManageRestaurant(workspace.role)) return fail("Manager access is required for restaurant returns.");
  return restaurantMutationFeedback(async () => {

    const context = contextFrom(workspace);
    const prepared = await prepareRestaurantSingleItemReturn(context, {
      orderId,
      orderItemId,
      quantity: returnQuantity,
    });

    await createRestaurantItemReturn(context, {
      orderId,
      reason,
      idempotencyKey: requestId || undefined,
      items: [{ orderItemId, quantity: returnQuantity, restock }],
      paymentAllocations: prepared.paymentAllocations,
    });
    refreshRestaurant(orderId);
  }, "Item return recorded.", "We could not create this return. Refresh return history before trying again.");
}
