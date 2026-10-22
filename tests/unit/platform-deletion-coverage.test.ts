import { describe, expect, it, vi } from "vitest";

// Pure coverage verification; never connect to Neon or delete any data in unit tests.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/server/platform-security", () => ({ assertPlatformMfaEnabled: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));

import { assertWorkspaceDeletionCoverage, WORKSPACE_PURGE_ORDER } from "@/lib/server/platform-admin";

describe("safe platform account deletion", () => {
  it("covers the 58 audited tenant tables", () => {
    expect(WORKSPACE_PURGE_ORDER).toHaveLength(58);
    expect(new Set(WORKSPACE_PURGE_ORDER).size).toBe(WORKSPACE_PURGE_ORDER.length);
    expect(WORKSPACE_PURGE_ORDER).toContain("restaurant_returns");
    expect(WORKSPACE_PURGE_ORDER).toContain("warehouse_stocks");
    expect(WORKSPACE_PURGE_ORDER).toContain("general_ledger_entries");
    expect(WORKSPACE_PURGE_ORDER).toContain("outbound_gate_passes");
    expect(WORKSPACE_PURGE_ORDER).toContain("subscription_events");
    expect(() => assertWorkspaceDeletionCoverage([...WORKSPACE_PURGE_ORDER])).not.toThrow();
  });

  it("fails closed on new tenant tables that lack reviewed deletion handling", () => {
    expect(() => assertWorkspaceDeletionCoverage([...WORKSPACE_PURGE_ORDER, "customer_new_sensitive_records"]))
      .toThrow(/schema changed/i);
  });

  it("fails closed if a known tenant table is missing from the actual schema", () => {
    const actual = WORKSPACE_PURGE_ORDER.filter((table) => table !== "restaurant_orders");
    expect(() => assertWorkspaceDeletionCoverage(actual)).toThrow(/schema changed/i);
  });

  it("deletes restricted dependencies before parent records", () => {
    function precedes(child: string, parent: string) {
      return WORKSPACE_PURGE_ORDER.indexOf(child as typeof WORKSPACE_PURGE_ORDER[number])
        < WORKSPACE_PURGE_ORDER.indexOf(parent as typeof WORKSPACE_PURGE_ORDER[number]);
    }
    expect(precedes("payment_allocations", "payments")).toBe(true);
    expect(precedes("restaurant_return_items", "restaurant_returns")).toBe(true);
    expect(precedes("restaurant_payments", "restaurant_orders")).toBe(true);
    expect(precedes("warehouse_stocks", "warehouses")).toBe(true);
  });
});
