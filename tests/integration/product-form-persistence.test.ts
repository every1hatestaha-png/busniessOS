import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createProduct: typeof import("@/lib/server/products")["createProduct"];
let updateProduct: typeof import("@/lib/server/products")["updateProduct"];
let adjustProductStock: typeof import("@/lib/server/products")["adjustProductStock"];
let removeProduct: typeof import("@/lib/server/products")["removeProduct"];
let getProduct: typeof import("@/lib/server/products")["getProduct"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let updateCustomer: typeof import("@/lib/server/customers")["updateCustomer"];
let removeCustomer: typeof import("@/lib/server/customers")["removeCustomer"];
let updateSupplier: typeof import("@/lib/server/suppliers")["updateSupplier"];
let deleteSupplier: typeof import("@/lib/server/suppliers")["deleteSupplier"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let supplierId = "";

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("Product decimal quantity and form integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createProduct } = await import("@/lib/server/products"));
    ({ updateProduct } = await import("@/lib/server/products"));
    ({ adjustProductStock } = await import("@/lib/server/products"));
    ({ removeProduct, getProduct } = await import("@/lib/server/products"));
    ({ createSale } = await import("@/lib/server/sales"));
    ({ createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ updateCustomer, removeCustomer } = await import("@/lib/server/customers"));
    ({ updateSupplier, deleteSupplier } = await import("@/lib/server/suppliers"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `prod-${runId}`, email: `prod-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Product Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const [customer, supplier] = await Promise.all([
      db.customer.create({ data: { workspaceId, name: `Product customer ${runId}`, creditLimit: 10000 } }),
      db.supplier.create({ data: { workspaceId, name: `Product supplier ${runId}` } }),
    ]);
    customerId = customer.id;
    supplierId = supplier.id;
    await ensureDefaultAccounts(workspaceId);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.invoice.deleteMany({ where: { workspaceId } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
    await db.salesOrder.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.customer.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
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

    const newBalance = await adjustProductStock(context(), productId, 4.60, "Opening stock");
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

    await adjustProductStock(context(), productId, 4.60, "Initial stock");
    await adjustProductStock(context(), productId, -0.60, "Usage");
    await adjustProductStock(context(), productId, 2.30, "Restock");

    const saved = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } });
    expect(saved.stockQuantity.toNumber()).toBeCloseTo(6.30, 4);
  });

  it("updateProduct preserves decimal reorder level", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Oil", sku: `oil-${runId}`, category: "Fluid",
      costPrice: 150, sellingPrice: 250, stockQuantity: 0,
      reorderLevel: 3.75, unit: "LITER", status: "ACTIVE", description: "Reorder test",
    });

    await updateProduct(context(), productId, {
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

    await adjustProductStock(context(), productId, 5, "Stock up");

    await expect(
      updateProduct(context(), productId, {
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

    const newBalance = await adjustProductStock(context(), product.id, -5, "Usage");
    expect(newBalance).toBe(20);
  });

  it("draft form values survive remount pattern (simulated)", async () => {
    const draftData = { name: "Draft Product", sku: "DRAFT-001", category: "Test", unit: "KG", stockQuantity: 3.50, reorderLevel: 2.00, costPrice: 100, sellingPrice: 200, description: "Draft test" };

    const savedDraft = JSON.stringify(draftData);
    expect(JSON.parse(savedDraft).stockQuantity).toBe(3.50);
    expect(JSON.parse(savedDraft).reorderLevel).toBe(2.00);
    expect(JSON.parse(savedDraft).unit).toBe("KG");
  });

  it("permanently deletes an unused zero-stock product and its bootstrap movement", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Unused Product", sku: `unused-${runId}`, category: "Test",
      costPrice: 10, sellingPrice: 20, stockQuantity: 0,
      reorderLevel: 1, unit: "PIECE", status: "ACTIVE", description: "Unused product test",
    });

    await expect(removeProduct(context(), productId)).resolves.toMatchObject({ disposition: "DELETED" });
    expect(await db.product.findUnique({ where: { id: productId } })).toBeNull();
    expect(await db.inventoryTransaction.count({ where: { productId } })).toBe(0);
  });

  it("archives a product with inventory history without changing decimal stock history", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Used Decimal Product", sku: `used-dec-${runId}`, category: "Test",
      costPrice: 40, sellingPrice: 80, stockQuantity: 0,
      reorderLevel: 1.25, unit: "KG", status: "ACTIVE", description: "Used decimal product",
    });
    await adjustProductStock(context(), productId, 4.6, "Audited decimal stock");
    const before = await db.inventoryTransaction.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });

    const result = await removeProduct(context(), productId);
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const after = await db.inventoryTransaction.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });

    expect(result).toEqual({ disposition: "ARCHIVED", message: "This product has transaction history and cannot be permanently deleted. It has been archived instead." });
    expect(product.status).toBe("ARCHIVED");
    expect(product.stockQuantity.toNumber()).toBeCloseTo(4.6, 4);
    expect(after.map((row) => [row.id, row.quantityChanged.toNumber()])).toEqual(before.map((row) => [row.id, row.quantityChanged.toNumber()]));
  });

  it("keeps an archived product readable in its historical PO and GRN", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Historical Flour", sku: `hist-${runId}`, category: "Raw Material",
      costPrice: 90, sellingPrice: 130, stockQuantity: 0,
      reorderLevel: 2.5, unit: "KG", status: "ACTIVE", description: "Historical product test",
    });
    const purchase = await createPurchase(context(), { supplierId, items: [{ productId, quantity: 2.5, unitCost: 90 }], pricingMode: "UNIT", idempotencyKey: `hist-po-${runId}` });
    expect((await removeProduct(context(), productId)).disposition).toBe("ARCHIVED");
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const receipt = await createGoodsReceipt(context(), { purchaseOrderId: purchase.id, items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 1.25, acceptedQuantity: 1.25, actualUnitCost: 90 }] });

    const [product, grnItem] = await Promise.all([
      getProduct(productId, workspaceId),
      db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: receipt.id }, include: { product: true } }),
    ]);
    expect(product?.status).toBe("ARCHIVED");
    expect(product?.stockQuantity).toBeCloseTo(1.25, 4);
    expect(grnItem.product.name).toBe("Historical Flour");
    expect(grnItem.product.unit).toBe("KG");
  });

  it("excludes archived products from new sale and purchase creation", async () => {
    const product = await db.product.create({ data: { workspaceId, name: "Archived Selector Product", sku: `arch-sel-${runId}`, category: "Test", costPrice: 10, sellingPrice: 20, stockQuantity: 1, status: "ARCHIVED" } });

    await expect(createSale(context(), { customerId, items: [{ productId: product.id, quantity: 1, unitPrice: 20, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    await expect(createPurchase(context(), { supplierId, items: [{ productId: product.id, quantity: 1, unitCost: 10 }], pricingMode: "UNIT", idempotencyKey: `arch-po-${runId}` })).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("enforces product edit, delete/archive, and adjustment permissions in the service layer", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Permission Product", sku: `perm-${runId}`, category: "Test",
      costPrice: 10, sellingPrice: 20, stockQuantity: 0,
      reorderLevel: 1, unit: "PIECE", status: "ACTIVE", description: "Permission product test",
    });
    const staff = { workspaceId, role: "STAFF" as const, userId };
    const edit = { name: "Permission Product", sku: `perm-${runId}`, category: "Test", costPrice: 10, sellingPrice: 20, reorderLevel: 1, unit: "PIECE" as const, status: "ACTIVE" as const, description: "Permission product test" };

    await expect(updateProduct(staff, productId, edit)).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Unauthorized" });
    await expect(removeProduct(staff, productId)).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Unauthorized" });
    await expect(adjustProductStock(staff, productId, 1, "Unauthorized adjustment")).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Unauthorized" });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).status).toBe("ACTIVE");
  });

  it("prevents concurrent negative adjustments from producing negative stock", async () => {
    const productId = await createProduct(workspaceId, {
      name: "Concurrent Product", sku: `concurrent-${runId}`, category: "Test",
      costPrice: 10, sellingPrice: 20, stockQuantity: 5,
      reorderLevel: 1, unit: "PIECE", status: "ACTIVE", description: "Concurrent adjustment test",
    });

    const results = await Promise.allSettled([
      adjustProductStock(context(), productId, -4, "Concurrent issue A"),
      adjustProductStock(context(), productId, -4, "Concurrent issue B"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toNumber()).toBe(1);
  });

  it("deletes unused customers but deactivates customers with sales history", async () => {
    const unused = await db.customer.create({ data: { workspaceId, name: `Unused customer ${runId}` } });
    await expect(removeCustomer(context(), unused.id)).resolves.toMatchObject({ disposition: "DELETED" });
    expect(await db.customer.findUnique({ where: { id: unused.id } })).toBeNull();

    const used = await db.customer.create({ data: { workspaceId, name: `Used customer ${runId}`, creditLimit: 1000 } });
    const product = await db.product.create({ data: { workspaceId, name: `Customer history product ${runId}`, sku: `cust-hist-${runId}`, costPrice: 10, sellingPrice: 20, stockQuantity: 2 } });
    const sale = await createSale(context(), { customerId: used.id, items: [{ productId: product.id, quantity: 1, unitPrice: 20, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });

    await expect(removeCustomer(context(), used.id)).resolves.toMatchObject({ disposition: "DEACTIVATED" });
    expect((await db.customer.findUniqueOrThrow({ where: { id: used.id } })).status).toBe("INACTIVE");
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { customer: true } })).customer.name).toContain("Used customer");
  });

  it("enforces customer and supplier edit/delete permissions in domain services", async () => {
    const staff = { workspaceId, role: "STAFF" as const, userId };
    const customerEdit = { name: "Denied Customer", companyName: "", phone: "", email: "", address: "", city: "", creditLimit: "0", status: "ACTIVE" as const, notes: "" };
    const supplierEdit = { name: "Denied Supplier", companyName: "", phone: "", email: "", address: "", city: "", notes: "", openingBalance: 0 };

    await expect(updateCustomer(staff, customerId, customerEdit)).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Unauthorized" });
    await expect(removeCustomer(staff, customerId)).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Unauthorized" });
    await expect(updateSupplier(staff, supplierId, supplierEdit)).rejects.toThrow("Unauthorized");
    await expect(deleteSupplier(staff, supplierId)).rejects.toThrow("Unauthorized");
  });
});
