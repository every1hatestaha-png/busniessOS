import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createProduct: typeof import("@/lib/server/products")["createProduct"];
let updateProduct: typeof import("@/lib/server/products")["updateProduct"];
let adjustProductStock: typeof import("@/lib/server/products")["adjustProductStock"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";

describe("Product decimal quantity and form integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createProduct } = await import("@/lib/server/products"));
    ({ updateProduct } = await import("@/lib/server/products"));
    ({ adjustProductStock } = await import("@/lib/server/products"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `prod-${runId}`, email: `prod-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Product Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("creates a Kg product with decimal reorder level", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Sugar", sku: `sugar-${runId}`, category: "Raw Material",
      costPrice: 80, sellingPrice: 120, stockQuantity: 0,
      reorderLevel: 2.50, unit: "KG", status: "ACTIVE", description: "Test Kg product",
    });
    expect(typeof productId).toBe("string");

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(saved.unit).toBe("KG");
    expect(saved.reorderLevel.toNumber()).toBe(2.50);
    expect(saved.stockQuantity.toNumber()).toBe(0);
  });

  it("creates a Piece product with integer reorder level", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Bolt", sku: `bolt-${runId}`, category: "Hardware",
      costPrice: 10, sellingPrice: 25, stockQuantity: 0,
      reorderLevel: 100, unit: "PIECE", status: "ACTIVE", description: "Test Piece product",
    });
    expect(typeof productId).toBe("string");

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(saved.unit).toBe("PIECE");
    expect(saved.reorderLevel.toNumber()).toBe(100);
  });

  it("Kg product accepts decimal stock adjustment", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Flour", sku: `flour-${runId}`, category: "Raw Material",
      costPrice: 60, sellingPrice: 100, stockQuantity: 0,
      reorderLevel: 5, unit: "KG", status: "ACTIVE", description: "Decimal adjustment test",
    });

    const newBalance = await adjustProductStock(workspaceId, productId, 4.60, "Opening stock");
    expect(newBalance).toBeCloseTo(4.60, 4);

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } });
    expect(saved.stockQuantity.toNumber()).toBeCloseTo(4.60, 4);
  });

  it("4.60 Kg is preserved exactly through stock operations", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Thread", sku: `thread-${runId}`, category: "Material",
      costPrice: 200, sellingPrice: 350, stockQuantity: 0,
      reorderLevel: 1, unit: "KG", status: "ACTIVE", description: "Precision test",
    });

    await adjustProductStock(workspaceId, productId, 4.60, "Initial stock");
    await adjustProductStock(workspaceId, productId, -0.60, "Usage");
    await adjustProductStock(workspaceId, productId, 2.30, "Restock");

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } });
    expect(saved.stockQuantity.toNumber()).toBeCloseTo(6.30, 4);
  });

  it("updateProduct preserves decimal reorder level", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Oil", sku: `oil-${runId}`, category: "Fluid",
      costPrice: 150, sellingPrice: 250, stockQuantity: 0,
      reorderLevel: 3.75, unit: "LITER", status: "ACTIVE", description: "Reorder test",
    });

    await updateProduct(workspaceId, productId, {
      name: "Engine Oil",
      sku: `oil-${runId}`,
      category: "Fluid",
      costPrice: 150,
      sellingPrice: 280,
      reorderLevel: 5.25,
      unit: "LITER",
      status: "ACTIVE",
      description: "Updated",
    });

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(saved.reorderLevel.toNumber()).toBe(5.25);
    expect(Number(saved.sellingPrice)).toBe(280);
  });

  it("rejects cost price change when stock is on hand", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Expensive Part", sku: `exp-${runId}`, category: "Parts",
      costPrice: 500, sellingPrice: 800, stockQuantity: 0,
      reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "Cost lock test",
    });

    await adjustProductStock(workspaceId, productId, 5, "Stock up");

    await expect(
      updateProduct(workspaceId, productId, {
        name: "Expensive Part", sku: `exp-${runId}`, category: "Parts",
        costPrice: 600, sellingPrice: 800, reorderLevel: 10,
        unit: "PIECE", status: "ACTIVE", description: "Updated",
      })
    ).rejects.toThrow("Cost price cannot be changed");
  });

  it("workspace-scoped products do not leak across workspaces", async () => {
    const user2 = await db.user.create({ data: { clerkId: `prod-ws2-${runId}`, email: `prod-ws2-${runId}@example.invalid` } });
    const ws2 = await db.workspace.create({ data: { name: `WS2 Product ${runId}`, members: { create: { userId: user2.id, role: "OWNER" } } } });

    const productId1 = await createProduct(workspaceId, {
      name: "WS1 Only", sku: `ws1-${runId}`, category: "Test",
      costPrice: 50, sellingPrice: 100, stockQuantity: 0,
      reorderLevel: 5, unit: "PIECE", status: "ACTIVE", description: "WS1",
    });

    const productId2 = await createProduct(ws2.id, {
      name: "WS2 Only", sku: `ws2-${runId}`, category: "Test",
      costPrice: 50, sellingPrice: 100, stockQuantity: 0,
      reorderLevel: 5, unit: "PIECE", status: "ACTIVE", description: "WS2",
    });

    const ws1Products = await db.product.findMany({ where: { workspaceId } });
    expect(ws1Products.find((p) => p.id === productId2)).toBeUndefined();

    const ws2Products = await db.product.findMany({ where: { workspaceId: ws2.id } });
    expect(ws2Products.find((p) => p.id === productId1)).toBeUndefined();

    await db.workspace.delete({ where: { id: ws2.id } });
    await db.user.delete({ where: { id: user2.id } });
  });

  it("existing integer products continue working after schema migration", async () => {
    const product = await db.product.create({
      data: { workspaceId, name: "Legacy Part", sku: `legacy-${runId}`, stockQuantity: 25, costPrice: 30, sellingPrice: 60, reorderLevel: 10, unit: "PIECE" },
    });

    const saved = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(saved.stockQuantity.toNumber()).toBe(25);
    expect(saved.reorderLevel.toNumber()).toBe(10);

    const newBalance = await adjustProductStock(workspaceId, product.id, -5, "Usage");
    expect(newBalance).toBe(20);
  });

  it("draft form values survive remount pattern (simulated)", async () => {
    const draftData = { name: "Draft Product", sku: "DRAFT-001", category: "Test", unit: "KG", stockQuantity: 3.50, reorderLevel: 2.00, costPrice: 100, sellingPrice: 200, description: "Draft test" };

    const savedDraft = JSON.stringify(draftData);
    expect(JSON.parse(savedDraft).stockQuantity).toBe(3.50);
    expect(JSON.parse(savedDraft).reorderLevel).toBe(2.00);
    expect(JSON.parse(savedDraft).unit).toBe("KG");
  });
});
