import "server-only";

import { listRestaurantKitchenItems, listRestaurantOrders } from "@/lib/server/restaurant-workspace";

/**
 * Independently cap each preparation lane so a backlog in READY cannot hide
 * incoming CONFIRMED orders. Keep all queries tenant-scoped.
 */
export const KITCHEN_LANE_LIMIT = 100;
const KITCHEN_LINE_BATCH = 250;

export async function listRestaurantKitchenQueue(workspaceId: string) {
  const [confirmed, preparing, ready] = await Promise.all([
    listRestaurantOrders(workspaceId, KITCHEN_LANE_LIMIT, { statuses: ["CONFIRMED"], oldestFirst: true }),
    listRestaurantOrders(workspaceId, KITCHEN_LANE_LIMIT, { statuses: ["PREPARING"], oldestFirst: true }),
    listRestaurantOrders(workspaceId, KITCHEN_LANE_LIMIT, { statuses: ["READY"], oldestFirst: true }),
  ]);
  const orders = [...confirmed, ...preparing, ...ready];
  const itemRequests = [];
  for (let start = 0; start < orders.length; start += KITCHEN_LINE_BATCH) {
    itemRequests.push(listRestaurantKitchenItems(
      workspaceId, orders.slice(start, start + KITCHEN_LINE_BATCH).map((order) => order.id),
    ));
  }
  const kitchenItems = new Map<string, Awaited<ReturnType<typeof listRestaurantKitchenItems>> extends Map<string, infer T> ? T : never>();
  for (const batch of await Promise.all(itemRequests)) {
    for (const [orderId, items] of batch) kitchenItems.set(orderId, items);
  }
  return {
    orders,
    kitchenItems,
    cappedStatuses: [
      ...(confirmed.length === KITCHEN_LANE_LIMIT ? ["New"] : []),
      ...(preparing.length === KITCHEN_LANE_LIMIT ? ["Preparing"] : []),
      ...(ready.length === KITCHEN_LANE_LIMIT ? ["Ready"] : []),
    ],
  };
}
