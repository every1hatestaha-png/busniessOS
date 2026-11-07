/**
 * Kitchen queue age is measured since the order was placed, not prep time.
 * Prep duration requires transition timestamps and must not be inferred.
 * Read-only operational alert thresholds, not an SLA promise.
 */
export type TicketAgeTone = "fresh" | "watch" | "delayed";

export function kitchenTicketAge(createdAt: Date | string, at: Date = new Date()): {
  minutes: number;
  label: string;
  tone: TicketAgeTone;
} {
  const start = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  const end = at.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { minutes: 0, label: "Time unavailable", tone: "fresh" };
  }
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  const tone = minutes >= 20 ? "delayed" : minutes >= 10 ? "watch" : "fresh";
  const label = minutes < 1 ? "Just ordered" : minutes < 60
    ? `${minutes} min since order`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m since order`;
  return { minutes, label, tone };
}

export function kitchenDelayedCount(
  orders: ReadonlyArray<{ createdAt: Date | string }>,
  at: Date = new Date(),
) {
  return orders.filter((order) => kitchenTicketAge(order.createdAt, at).tone === "delayed").length;
}
