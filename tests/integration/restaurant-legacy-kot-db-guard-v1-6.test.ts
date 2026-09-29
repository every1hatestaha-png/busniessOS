import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
const runId = randomUUID();
let userId = "";
let workspaceId = "";
let productId = "";

describe("restaurant V1.6 legacy KOT inventory database guard", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    const user = await db.user.create({ data: { clerkId: `legacy-kot-guard-${runId}`, email: `legacy-kot-guard-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Legacy KOT Guard ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const product = await db.product.create({ data: { workspaceId, name: "Guard Ingredient", sku: `GUARD-${runId}`, stockQuantity: 10, costPrice: 10, sellingPrice: 0 } });
    productId = product.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects any new KITCHEN inventory adjustment at the database boundary", async () => {
    await expect(db.inventoryTransaction.create({
      data: {
        workspaceId,
        productId,
        type: "ADJUSTMENT",
        quantityChanged: -1,
        unitCost: 10,
        reference: `KITCHEN:${randomUUID()}`,
      },
    })).rejects.toThrow("Legacy kitchen tickets are status-only and cannot post inventory");

    expect(await db.inventoryTransaction.count({ where: { workspaceId, reference: { startsWith: "KITCHEN:" } } })).toBe(0);
  });
});
