/** The kitchen loads bounded FIFO slices independently for each status.
 * Max 225 IDs total keeps the batched tenant-scoped line fetch below its cap.
 */
export const KITCHEN_TICKET_BATCH_LIMIT = 75;

export function kitchenVisibleCount(count: number): string {
  if (!Number.isInteger(count) || count < 0) return "0";
  return count >= KITCHEN_TICKET_BATCH_LIMIT ? `${KITCHEN_TICKET_BATCH_LIMIT}+` : String(count);
}
