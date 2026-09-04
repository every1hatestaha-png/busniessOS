import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];

let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];

let createProduct: typeof import("@/lib/server/products")["createProduct"];
let updateProduct: typeof import("@/lib/server/products")["updateProduct"];
let removeProduct: typeof import("@/lib/server/products")["removeProduct"];
let adjustProductStock: typeof import("@/lib/server/products")["adjustProductStock"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let recordSupplierPayment: typeof import("@/lib/server/suppliers")["recordSupplierPayment"];
let createCustomer: typeof import("@/lib/server/customers")["createCustomer"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let supplierId = "";
let cashBankAccountId = "";
let pieceProductId = "";
let kgProductId = "";
let saleTestProductId = "";

const ctx = () => ({ workspaceId, userId, role: "OWNER" as const });

function glEntries(sourceType: string, sourceId: string) {
  return db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: sourceType as never, sourceId }, include: { account: true }, orderBy: { createdAt: "asc" } });
}

function journalBalanced(entries: Awaited<ReturnType<typeof glEntries>>) {
  const d = entries.reduce((a, e) => a + Number(e.debit), 0);
  const c = entries.reduce((a, e) => a + Number(e.credit), 0);
  return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.01 };
}

describe("Phase 7: Full lifecycle integration tests", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSale } = await import("@/lib/server/sales"));
    ({ createCustomerReturn } = await import("@/lib/server/sales"));
    ({ createPurchase } = await import("@/lib/server/purchases"));
    ({ createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ createSupplierReturn } = await import("@/lib/server/purchases"));
    ({ createProduct } = await import("@/lib/server/products"));
    ({ updateProduct } = await import("@/lib/server/products"));
    ({ removeProduct } = await import("@/lib/server/products"));
    ({ adjustProductStock } = await import("@/lib/server/products"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ recordSupplierPayment } = await import("@/lib/server/suppliers"));
    ({ createCustomer } = await import("@/lib/server/customers"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const user = await db.user.create({ data: { clerkId: `p7-${runId}`, email: `p7-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Phase7 Test ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;

    const [customer, supplier] = await Promise.all([
      createCustomer(ctx(), { name: "Test Customer", companyName: "Test Customer Co", phone: "03001234567", email: "test@example.invalid", city: "Karachi", address: "Test Address 123", creditLimit: "5000000", openingBalance: "0", status: "ACTIVE", notes: "Phase 7 test customer" }),
      db.supplier.create({ data: { workspaceId, name: "Test Supplier" } }),
    ]);
    customerId = customer;
    supplierId = supplier.id;

    const [pieceProduct, kgProduct, saleTestProduct] = await Promise.all([
      createProduct(workspaceId, { name: "Widget", sku: `WDG-${runId}`, category: "Parts", costPrice: 100, sellingPrice: 200, stockQuantity: 0, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "Test widget product" }),
      createProduct(workspaceId, { name: "Rice", sku: `RICE-${runId}`, category: "Grain", costPrice: 200, sellingPrice: 350, stockQuantity: 0, reorderLevel: 5, unit: "KG", status: "ACTIVE", description: "Test kg product for weight pricing" }),
      createProduct(workspaceId, { name: "Sale Widget", sku: `SALE-WDG-${runId}`, category: "Parts", costPrice: 100, sellingPrice: 200, stockQuantity: 0, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "Dedicated sale test product" }),
    ]);
    pieceProductId = pieceProduct;
    kgProductId = kgProduct;
    saleTestProductId = saleTestProduct;

    await ensureDefaultAccounts(workspaceId);
    const defaultCashBank = await db.cashBankAccount.findFirst({ where: { workspaceId }, select: { id: true } });
    cashBankAccountId = defaultCashBank!.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.paymentAllocation.deleteMany({ where: { payment: { workspaceId } } });
    await db.payment.deleteMany({ where: { workspaceId } });
    await db.customerCreditAllocation.deleteMany({ where: { creditNote: { workspaceId } } });
    await db.creditNote.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
    await db.customerReturn.deleteMany({ where: { workspaceId } });
    await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
    await db.supplierReturn.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.invoice.deleteMany({ where: { workspaceId } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
    await db.salesOrder.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.customer.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  describe("A: Complete sale lifecycle", () => {
    it("creates sale with inventory reduction, COGS, and GL balanced", async () => {
      await adjustProductStock(ctx(), saleTestProductId, 100, "Opening stock for sale tests");
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: saleTestProductId }, select: { stockQuantity: true } });

      const sale = await createSale(ctx(), {
        customerId,
        items: [{ productId: saleTestProductId, quantity: 10, unitPrice: 200, discount: 0 }],
        orderDiscount: 0,
        paidAmount: 0,
        notes: "Phase 7 test sale",
        idempotencyKey: randomUUID(),
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: saleTestProductId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() - 10);

      const gl = await glEntries("SALE", sale.id);
      expect(gl.length).toBeGreaterThanOrEqual(2);
      expect(journalBalanced(gl).balanced).toBe(true);

      const order = await db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } });
      expect(Number(order.total)).toBe(2000);
      expect(order.status).toBe("CONFIRMED");
    });
  });

  describe("B: Credit sale + later payment", () => {
    it("records payment and updates balances", async () => {
      const sale = await createSale(ctx(), {
        customerId,
        items: [{ productId: saleTestProductId, quantity: 5, unitPrice: 200, discount: 0 }],
        orderDiscount: 0,
        paidAmount: 0,
        notes: "Credit sale",
        idempotencyKey: randomUUID(),
      });

      const customerBefore = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { currentBalance: true } });

      const payKey = randomUUID();
      await recordPayment(ctx(), {
        customerId,
        invoiceId: (await db.invoice.findFirstOrThrow({ where: { salesOrderId: sale.id } })).id,
        cashBankAccountId,
        amount: 500,
        paymentDate: new Date(),
        method: "CASH",
        notes: "Partial payment",
        idempotencyKey: payKey,
      });

      const customerAfter = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { currentBalance: true } });
      expect(customerBefore.currentBalance.toNumber() - customerAfter.currentBalance.toNumber()).toBeCloseTo(500, 2);

      const gl = await glEntries("RECEIPT", (await db.payment.findFirstOrThrow({ where: { workspaceId, idempotencyKey: payKey } })).id);
      expect(journalBalanced(gl).balanced).toBe(true);
    });
  });

  describe("C: Customer return", () => {
    it("creates return with credit note and inventory restoration", async () => {
      const sale = await createSale(ctx(), {
        customerId,
        items: [{ productId: saleTestProductId, quantity: 3, unitPrice: 200, discount: 0 }],
        orderDiscount: 0,
        paidAmount: 0,
        notes: "Return test sale",
        idempotencyKey: randomUUID(),
      });

      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: saleTestProductId }, select: { stockQuantity: true } });
      const saleItems = await db.salesOrderItem.findMany({ where: { salesOrderId: sale.id } });

      const ret = await createCustomerReturn(ctx(), {
        salesOrderId: sale.id,
        items: [{ itemId: saleItems[0].id, quantity: 1 }],
        restock: true,
        reason: "Defective item",
        notes: "Phase 7 test return",
        idempotencyKey: randomUUID(),
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: saleTestProductId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() + 1);

      const creditNote = await db.creditNote.findFirst({ where: { workspaceId, customerReturnId: ret.id } });
      expect(creditNote).toBeDefined();
      expect(Number(creditNote!.amount)).toBe(200);

      const gl = await glEntries("CUSTOMER_RETURN", ret.id);
      expect(journalBalanced(gl).balanced).toBe(true);
    });
  });

  describe("D: Purchase + GRN lifecycle", () => {
    it("creates purchase, receives goods, updates inventory and supplier payable", async () => {
      const po = await createPurchase(ctx(), {
        supplierId,
        items: [{ productId: pieceProductId, quantity: 20, unitCost: 100 }],
        pricingMode: "UNIT",
        idempotencyKey: randomUUID(),
      });

      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });

      const grn = await createGoodsReceipt(ctx(), {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 100 }],
        idempotencyKey: randomUUID(),
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber() + 20);

      const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(supplier.currentBalance.toNumber()).toBeGreaterThan(0);

      const gl = await glEntries("PURCHASE_RECEIPT", grn.id);
      expect(journalBalanced(gl).balanced).toBe(true);

      const poAfter = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
      expect(Number(poAfter.balanceAmount)).toBe(2000);
    });
  });

  describe("E: Weight-based GRN", () => {
    it("creates weight-based GRN with correct line amount", async () => {
      const po = await createPurchase(ctx(), {
        supplierId,
        items: [{ productId: kgProductId, quantity: 10, unitCost: 286, perKgRate: 286, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: randomUUID(),
      });

      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

      const grn = await createGoodsReceipt(ctx(), {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.6, acceptedQuantity: 4.6, actualUnitCost: 286, receivedWeightKg: 4.6, acceptedWeightKg: 4.6, ratePerKg: 286 }],
        idempotencyKey: randomUUID(),
      });

      const grnItem = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItem.lineAmount?.toNumber()).toBeCloseTo(1315.60, 2);

      const gl = await glEntries("PURCHASE_RECEIPT", grn.id);
      expect(journalBalanced(gl).balanced).toBe(true);
    });
  });

  describe("F: Supplier return", () => {
    it("creates supplier return with inventory reduction and payable reversal", async () => {
      const freshProduct = await db.product.create({
        data: { workspaceId, name: "Fresh Return Product", sku: `RET-${runId}`, category: "Parts", costPrice: 50, sellingPrice: 100, stockQuantity: 0, reorderLevel: 5, unit: "PIECE", status: "ACTIVE", description: "Dedicated supplier return test product" },
      });

      const po = await createPurchase(ctx(), {
        supplierId,
        items: [{ productId: freshProduct.id, quantity: 10, unitCost: 50 }],
        pricingMode: "UNIT",
        idempotencyKey: randomUUID(),
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
      await createGoodsReceipt(ctx(), {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 50 }],
        idempotencyKey: randomUUID(),
      });

      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: freshProduct.id }, select: { stockQuantity: true } });
      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

      const ret = await createSupplierReturn(ctx(), {
        purchaseOrderId: po.id,
        items: [{ itemId: poItem.id, quantity: 2 }],
        reason: "Defective goods",
        notes: "Phase 7 test supplier return",
        idempotencyKey: randomUUID(),
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: freshProduct.id }, select: { stockQuantity: true } });
      expect(stockBefore.stockQuantity.toNumber() - stockAfter.stockQuantity.toNumber()).toBeCloseTo(2, 4);

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(supplierBefore.currentBalance.toNumber() - supplierAfter.currentBalance.toNumber()).toBeCloseTo(100, 2);

      const gl = await glEntries("SUPPLIER_RETURN", ret.id);
      expect(journalBalanced(gl).balanced).toBe(true);
    });
  });

  describe("G: Inventory adjustment", () => {
    it("adjusts stock and creates audit log", async () => {
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { stockQuantity: true } });

      const newQty = await adjustProductStock(ctx(), pieceProductId, 5, "Cycle count correction");
      expect(newQty).toBe(stockBefore.stockQuantity.toNumber() + 5);

      const audit = await db.auditLog.findFirst({
        where: { workspaceId, entityType: "Product", entityId: pieceProductId, action: "stock.adjusted" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
    });
  });

  describe("H: Product archive/delete safety", () => {
    it("archives product with history instead of deleting", async () => {
      const result = await removeProduct(ctx(), pieceProductId);
      expect(result.disposition).toBe("ARCHIVED");

      const archived = await db.product.findUniqueOrThrow({ where: { id: pieceProductId } });
      expect(archived.status).toBe("ARCHIVED");
    });
  });

  describe("I: Supplier payment", () => {
    it("records supplier payment with GL balanced", async () => {
      const freshProduct = await db.product.create({
        data: { workspaceId, name: "Payment Test Product", sku: `PAY-${runId}`, category: "Parts", costPrice: 50, sellingPrice: 100, stockQuantity: 0, reorderLevel: 5, unit: "PIECE", status: "ACTIVE", description: "Dedicated supplier payment test product" },
      });

      const po = await createPurchase(ctx(), {
        supplierId,
        items: [{ productId: freshProduct.id, quantity: 20, unitCost: 50 }],
        pricingMode: "UNIT",
        idempotencyKey: randomUUID(),
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
      await createGoodsReceipt(ctx(), {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 50 }],
        idempotencyKey: randomUUID(),
      });

      const supplierBefore = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });

      await recordSupplierPayment(ctx(), supplierId, {
        amount: 500,
        cashBankAccountId,
        allocations: [{ purchaseOrderId: po.id, amount: 500 }],
        method: "CASH",
        paymentDate: new Date(),
        idempotencyKey: randomUUID(),
      });

      const supplierAfter = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { currentBalance: true } });
      expect(supplierBefore.currentBalance.toNumber() - supplierAfter.currentBalance.toNumber()).toBeCloseTo(500, 2);

      const payment = await db.payment.findFirst({ where: { workspaceId, customerId: null }, orderBy: { createdAt: "desc" } });
      const gl = await glEntries("PAYMENT", payment!.id);
      expect(journalBalanced(gl).balanced).toBe(true);
    });
  });

  describe("J: Customer payment", () => {
    it("records customer payment with GL balanced", async () => {
      const customerBefore = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { currentBalance: true } });

      const latestInvoice = await db.invoice.findFirst({ where: { workspaceId, customerId, status: { notIn: ["CANCELLED", "DRAFT"] } }, orderBy: { createdAt: "desc" } });
      if (!latestInvoice) return;

      const outstanding = Number(latestInvoice.amount) - Number(latestInvoice.paidAmount) - Number(latestInvoice.creditApplied);
      if (outstanding <= 0) return;

      const payAmount = Math.min(outstanding, 300);
      await recordPayment(ctx(), {
        customerId,
        invoiceId: latestInvoice.id,
        cashBankAccountId,
        amount: payAmount,
        paymentDate: new Date(),
        method: "BANK_TRANSFER",
        notes: "Phase 7 test payment",
        idempotencyKey: randomUUID(),
      });

      const customerAfter = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { currentBalance: true } });
      expect(customerBefore.currentBalance.toNumber() - customerAfter.currentBalance.toNumber()).toBeCloseTo(payAmount, 2);
    });
  });

  describe("K: Cash/bank posting", () => {
    it("updates cash bank balance on payment", async () => {
      const cashBankBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId }, select: { currentBalance: true } });

      const latestInvoice = await db.invoice.findFirst({ where: { workspaceId, customerId, status: { notIn: ["CANCELLED", "DRAFT"] } }, orderBy: { createdAt: "desc" } });
      if (!latestInvoice) return;

      const outstanding = Number(latestInvoice.amount) - Number(latestInvoice.paidAmount) - Number(latestInvoice.creditApplied);
      if (outstanding <= 0) return;

      const payAmount = Math.min(outstanding, 100);
      await recordPayment(ctx(), {
        customerId,
        invoiceId: latestInvoice.id,
        cashBankAccountId,
        amount: payAmount,
        paymentDate: new Date(),
        method: "CASH",
        idempotencyKey: randomUUID(),
      });

      const cashBankAfter = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId }, select: { currentBalance: true } });
      expect(cashBankAfter.currentBalance.toNumber() - cashBankBefore.currentBalance.toNumber()).toBeCloseTo(payAmount, 2);
    });
  });

  describe("L: GL balanced after major workflows", () => {
    it("all GL entries from sale, payment, GRN, supplier payment are balanced", async () => {
      const allEntries = await db.generalLedgerEntry.findMany({ where: { workspaceId, reversedAt: null } });
      const totalDebit = allEntries.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = allEntries.reduce((sum, e) => sum + Number(e.credit), 0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    });
  });

  describe("M: Cross-workspace mutation blocked", () => {
    it("blocks cross-workspace product edit", async () => {
      const otherUser = await db.user.create({ data: { clerkId: `p7other-${runId}`, email: `p7other-${runId}@example.invalid` } });
      const otherWs = await db.workspace.create({ data: { name: `Other WS ${runId}`, members: { create: { userId: otherUser.id, role: "OWNER" } } } });

      await expect(
        updateProduct({ workspaceId: otherWs.id, userId: otherUser.id, role: "OWNER" }, pieceProductId, {
          name: "Hacked", sku: `HACK-${runId}`, category: "X", costPrice: 1, sellingPrice: 2, reorderLevel: 0, unit: "PIECE", status: "ACTIVE", description: "Cross-workspace attack",
        })
      ).rejects.toThrow("Product not found");

      await db.workspace.delete({ where: { id: otherWs.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe("N: Historical immutability", () => {
    it("product metadata edit does not change historical GL amounts", async () => {
      const po = await db.purchaseOrder.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
      if (!po) return;

      const glBefore = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "PURCHASE_RECEIPT" } });
      const totalBefore = glBefore.reduce((sum, e) => sum + Number(e.debit), 0);

      const currentCost = (await db.product.findUniqueOrThrow({ where: { id: pieceProductId }, select: { costPrice: true } })).costPrice.toNumber();
      await updateProduct(ctx(), pieceProductId, {
        name: "Updated Widget", sku: `WDG-UPD-${runId}`, category: "Parts Updated", costPrice: currentCost, sellingPrice: 250, reorderLevel: 15, unit: "PIECE", status: "ARCHIVED", description: "Updated product metadata for immutability test",
      });

      const glAfter = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "PURCHASE_RECEIPT" } });
      const totalAfter = glAfter.reduce((sum, e) => sum + Number(e.debit), 0);
      expect(totalAfter).toBe(totalBefore);
    });
  });

  describe("O: Audit log coverage", () => {
    it("captures audit entries for key operations", async () => {
      const auditCount = await db.auditLog.count({ where: { workspaceId } });
      expect(auditCount).toBeGreaterThan(0);

      const actions = await db.auditLog.findMany({ where: { workspaceId }, select: { action: true } });
      const actionTypes = new Set(actions.map((a) => a.action));
      expect(actionTypes.has("stock.adjusted")).toBe(true);
    });
  });

  describe("P: Data consistency", () => {
    it("customer balance reconciles with ledger entries", async () => {
      const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
      const ledgerEntries = await db.ledgerEntry.findMany({ where: { workspaceId, customerId } });

      const totalDebit = ledgerEntries.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = ledgerEntries.reduce((sum, e) => sum + Number(e.credit), 0);
      const expectedBalance = totalDebit - totalCredit;

      expect(Math.abs(Number(customer.currentBalance) - expectedBalance)).toBeLessThan(0.01);
    });

    it("supplier balance reconciles with ledger entries", async () => {
      const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      const ledgerEntries = await db.ledgerEntry.findMany({ where: { workspaceId, supplierId } });

      const totalDebit = ledgerEntries.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCredit = ledgerEntries.reduce((sum, e) => sum + Number(e.credit), 0);
      const expectedBalance = totalCredit - totalDebit;

      expect(Math.abs(Number(supplier.currentBalance) - expectedBalance)).toBeLessThan(0.01);
    });
  });
});
