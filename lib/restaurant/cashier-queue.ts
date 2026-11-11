/**
 * Keep cashier queues fair across stages and the batched payment projection
 * below the service's maximum 500 distinct orders:
 * (4 stages × 60) + 30 recent + 200 outstanding = 470.
 */
export const CASHIER_QUEUE_LIMIT = 60;

export function cashierQueueLabel(count: number): string {
  if (!Number.isSafeInteger(count) || count < 0) return "0";
  return count >= CASHIER_QUEUE_LIMIT ? `${CASHIER_QUEUE_LIMIT}+` : String(count);
}
