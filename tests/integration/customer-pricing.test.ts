import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let saveCustomerPriceRule: typeof import("@/lib/server/customer-pricing")["saveCustomerPriceRule"];
let deleteCustomerPriceRule: typeof import("@/lib/server/customer-pricing")["deleteCustomerPriceRule"];
let listCustomerPriceRules: typeof import("@/lib/server/customer-pricing")["listCustomerPriceRules"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let customerId = "";
let productId = "";

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("customer price tier persistence", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ saveCustomerPriceRule, deleteCustomerPriceRule, listCustomerPriceRules } = await import("@/lib/server/customer-pricing"));

    const user = await db.user.create({ data: { clerkId: `price-rules-${runId}`, email: `price-rules-${runId}@example.invalid` } });
    userId = user.id;
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: `Pricing ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Pricing Other ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    const customer = await db.customer.create({ data: { workspaceId, name: "Tier Customer" } });
    const product = await db.product.create({ data: { workspaceId, name: "Tier Product", sku: `TIER-${runId}`, sellingPrice: 120 } });
    customerId = customer.id;
    productId = product.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.customerPriceRule.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.product.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.customer.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("upserts a quantity tier, records the actor, and deletes it audibly", async () => {
    const saved = await saveCustomerPriceRule(context(), customerId, {
      productId,
      minQuantity: 10,
      unitPrice: 95,
      discountPerUnit: 2,
    });
    await saveCustomerPriceRule(context(), customerId, {
      productId,
      minQuantity: 10,
      unitPrice: 90,
      discountPerUnit: 1,
    });

    const rules = await listCustomerPriceRules(workspaceId, customerId);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ id: saved.id, minQuantity: 10, unitPrice: 90, discountPerUnit: 1 });
    const savedAudit = await db.auditLog.findFirstOrThrow({ where: { workspaceId, entityId: saved.id, action: "customer_price_rule.saved" }, orderBy: { createdAt: "desc" } });
    expect(savedAudit.actorId).toBe(userId);

    await deleteCustomerPriceRule(context(), customerId, saved.id);
    expect(await db.customerPriceRule.count({ where: { id: saved.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { workspaceId, entityId: saved.id, action: "customer_price_rule.deleted" } })).toBe(1);
  });

  it("rejects cross-workspace products", async () => {
    const otherProduct = await db.product.create({ data: { workspaceId: otherWorkspaceId, name: "Other Product", sku: `OTHER-${runId}`, sellingPrice: 1 } });
    await expect(saveCustomerPriceRule(context(), customerId, {
      productId: otherProduct.id,
      minQuantity: 1,
      unitPrice: 1,
      discountPerUnit: 0,
    })).rejects.toThrow("Product not found");
  });
});
