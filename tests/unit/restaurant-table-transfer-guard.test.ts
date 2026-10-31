import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const workspaceId = "2002f828-dbc8-4f2a-bfec-b32f35043144";
const actorId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const fromId = "33333333-3333-4333-8333-333333333333";
const toId = "44444444-4444-4444-8444-444444444444";

const m = vi.hoisted(() => ({
  query: vi.fn(), exec: vi.fn(), audit: vi.fn(),
  release: vi.fn(), requireModule: vi.fn(),
  transaction: vi.fn(), occupancyBlocked: false,
  orderMissing: false, currentTable: "", targetStatus: "AVAILABLE",
}));
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: m.query } }));
vi.mock("@/lib/server/industry-modules", () => ({
  IndustryDomainError: class IndustryDomainError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  requireWorkspaceModule: m.requireModule,
}));
vi.mock("@/lib/server/audit", () => ({ writeAudit: m.audit }));
vi.mock("@/lib/server/restaurant-table-settlement", () => ({ releaseRestaurantTableIfSettled: m.release }));
vi.mock("@/lib/server/tx-retry", () => ({
  withSerializableRetry: (callback: (tx: unknown) => Promise<unknown>) => m.transaction(callback),
}));

const ctx = { workspaceId, userId: actorId, role: "MANAGER" as const };
function textOf(strings: TemplateStringsArray | string[]) {
  return Array.from(strings).join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  m.occupancyBlocked = false;
  m.orderMissing = false;
  m.currentTable = fromId;
  m.targetStatus = "AVAILABLE";
  m.exec.mockResolvedValue(1);
  m.audit.mockResolvedValue(undefined);
  m.release.mockResolvedValue({ released: true });
  m.requireModule.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async cb => cb({ $queryRaw: m.query, $executeRaw: m.exec }));
  m.query.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = textOf(strings);
    if (sql.includes('FROM "restaurant_orders"')) {
      if (m.orderMissing) return [];
      return [{ id: orderId, orderNumber: "R-000001", status: "PREPARING", fulfillmentType: "DINE_IN", tableId: m.currentTable }];
    }
    if (sql.includes('FROM "restaurant_tables"')) {
      return [
        { id: fromId, name: "Table 01", status: "OCCUPIED" },
        { id: toId, name: "Table 02", status: m.targetStatus },
      ];
    }
    if (sql.includes("restaurant_table_has_occupancy_blocker")) return [{ blocked: m.occupancyBlocked }];
    return [];
  });
});

describe("Restaurant table transfer is tenant-locked and audited", () => {
  it("denies staff before any workspace data read or write", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    await expect(transferRestaurantDineInTable({ ...ctx, role: "STAFF" }, orderId, toId, "Customer request"))
      .rejects.toThrow("Only a restaurant manager");
    expect(m.requireModule).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("denies a cross-tenant order without changing anything", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    m.orderMissing = true;
    await expect(transferRestaurantDineInTable(ctx, orderId, toId, "Customer request"))
      .rejects.toThrow("does not belong to this workspace");
    expect(m.exec).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("blocks reserved/occupied targets and any hidden occupancy obligation", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    m.targetStatus = "OCCUPIED";
    await expect(transferRestaurantDineInTable(ctx, orderId, toId, "Customer request"))
      .rejects.toThrow("Destination table is unavailable");
    m.targetStatus = "AVAILABLE";
    m.occupancyBlocked = true;
    await expect(transferRestaurantDineInTable(ctx, orderId, toId, "Customer request"))
      .rejects.toThrow("another active or unpaid");
    expect(m.exec).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("keeps duplicate same-destination requests idempotent", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    m.currentTable = toId;
    expect(await transferRestaurantDineInTable(ctx, orderId, toId, "Customer request"))
      .toMatchObject({ moved: false, orderNumber: "R-000001" });
    expect(m.exec).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("updates the order and kitchen ticket and releases old table only when safe", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    const result = await transferRestaurantDineInTable(ctx, orderId, toId, "Move diners to Terrace");
    expect(result).toMatchObject({ moved: true, destination: "Table 02" });
    expect(m.exec).toHaveBeenCalledTimes(3);
    const sql = m.exec.mock.calls.map(([parts, ...values]) => Prisma.sql(parts, ...values).text);
    expect(sql[0]).toContain('UPDATE "restaurant_orders"');
    expect(sql[1]).toContain('UPDATE "kitchen_tickets"');
    expect(sql[2]).toContain('UPDATE "restaurant_tables"');
    expect(m.release).toHaveBeenCalledWith(expect.anything(), workspaceId, fromId);
    expect(m.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "restaurant.table.transferred",
      workspaceId, actorId,
      metadata: expect.objectContaining({ fromTableId: fromId, toTableId: toId, oldTableReleased: true }),
    }));
  });

  it("requires a substantive audit reason", async () => {
    const { transferRestaurantDineInTable } = await import("@/lib/server/restaurant-table-transfer");
    await expect(transferRestaurantDineInTable(ctx, orderId, toId, "ok")).rejects.toThrow("transfer reason");
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
