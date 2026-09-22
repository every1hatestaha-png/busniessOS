import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
let workspaceA = "";
let workspaceB = "";
let customerA = "";
let customerB = "";

describe("database tenant parent guards", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));

    const [a, b] = await Promise.all([
      db.workspace.create({ data: { name: `Tenant Guard A ${runId}` } }),
      db.workspace.create({ data: { name: `Tenant Guard B ${runId}` } }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;

    const [ca, cb] = await Promise.all([
      db.customer.create({ data: { workspaceId: workspaceA, name: "Customer A" } }),
      db.customer.create({ data: { workspaceId: workspaceB, name: "Customer B" } }),
    ]);
    customerA = ca.id;
    customerB = cb.id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.payment.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.salesOrder.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.customer.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 30_000);

  it("allows a same-workspace sales order parent", async () => {
    const order = await db.salesOrder.create({
      data: {
        workspaceId: workspaceA,
        customerId: customerA,
        orderNumber: `TG-SAME-${runId}`,
      },
    });
    expect(order.workspaceId).toBe(workspaceA);
    await db.salesOrder.delete({ where: { id: order.id } });
  });

  it("rejects a sales order linked to a customer from another workspace", async () => {
    await expect(db.salesOrder.create({
      data: {
        workspaceId: workspaceA,
        customerId: customerB,
        orderNumber: `TG-CROSS-SALE-${runId}`,
      },
    })).rejects.toThrow();
    expect(await db.salesOrder.count({
      where: { workspaceId: workspaceA, orderNumber: `TG-CROSS-SALE-${runId}` },
    })).toBe(0);
  });

  it("rejects a payment linked to a customer from another workspace", async () => {
    await expect(db.payment.create({
      data: {
        workspaceId: workspaceA,
        customerId: customerB,
        amount: 10,
      },
    })).rejects.toThrow();
    expect(await db.payment.count({
      where: { workspaceId: workspaceA, customerId: customerB },
    })).toBe(0);
  });
});
