import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { afterAll, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { getRestaurantWorkspaceMetrics, listRestaurantOrders } from "@/lib/server/restaurant-workspace";

afterAll(() => db.$disconnect());

it.skipIf(!process.env.STAGING_READ_WORKSPACE)("measures bounded Restaurant reads on the approved staging database", async () => {
  const workspaceId = process.env.STAGING_READ_WORKSPACE!;
  const host = new URL(process.env.DATABASE_URL!).hostname;
  expect(host).toBe(process.env.APPROVED_STAGING_DATABASE_HOST);
  expect(host).not.toBe("ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech");
  const find = vi.spyOn(db.workspace, "findUnique");
  const raw = vi.spyOn(db, "$queryRaw");
  const measurements = [];
  for (let sample = 0; sample < 5; sample++) {
    find.mockClear(); raw.mockClear();
    const start = performance.now();
    const [metrics, orders] = await Promise.all([
      getRestaurantWorkspaceMetrics(workspaceId),
      listRestaurantOrders(workspaceId, 40, { statuses: ["CONFIRMED", "PREPARING", "READY"], oldestFirst: true }),
    ]);
    expect(metrics.todayOrders).toBeGreaterThanOrEqual(0);
    expect(orders.length).toBeLessThanOrEqual(40);
    expect(orders.every(order => ["CONFIRMED", "PREPARING", "READY"].includes(order.status))).toBe(true);
    measurements.push({ ms: Number((performance.now() - start).toFixed(2)), queries: find.mock.calls.length + raw.mock.calls.length });
  }
  vi.restoreAllMocks();
  if (process.env.STAGING_PERFORMANCE_OUTPUT) writeFileSync(process.env.STAGING_PERFORMANCE_OUTPUT, JSON.stringify({ workspaceId, workload: "aggregate metrics + bounded live orders; five sequential samples", measurements }, null, 2));
}, 60_000);
