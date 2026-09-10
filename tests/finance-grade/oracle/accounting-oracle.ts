/**
 * Independent Accounting Oracle.
 * Tracks expected financial state independently of BusinessOS.
 * BusinessOS is NOT the source of truth — this oracle is.
 */

import type {
  OracleProduct,
  OracleSupplier,
  OracleCustomer,
  OracleCashBankAccount,
  OracleGLEntry,
  OracleInventoryTransaction,
  OracleLedgerEntry,
  OraclePayment,
  OracleSnapshot,
  ReconciliationResult,
  TrialBalance,
  TrialBalanceEntry,
} from "./types";
import { roundMoney, roundQuantity, assertBalanced, calculateWAC } from "./precision";

export class AccountingOracle {
  private products = new Map<string, OracleProduct>();
  private suppliers = new Map<string, OracleSupplier>();
  private customers = new Map<string, OracleCustomer>();
  private cashBankAccounts = new Map<string, OracleCashBankAccount>();
  private glEntries: OracleGLEntry[] = [];
  private inventoryTransactions: OracleInventoryTransaction[] = [];
  private ledgerEntries: OracleLedgerEntry[] = [];
  private payments: OraclePayment[] = [];

  // ─── SNAPSHOT ──────────────────────────────────────────────────────────────

  snapshot(): OracleSnapshot {
    return {
      products: new Map(this.products),
      suppliers: new Map(this.suppliers),
      customers: new Map(this.customers),
      cashBankAccounts: new Map(this.cashBankAccounts),
      glEntries: [...this.glEntries],
      inventoryTransactions: [...this.inventoryTransactions],
      ledgerEntries: [...this.ledgerEntries],
      payments: [...this.payments],
    };
  }

  // ─── SEED ──────────────────────────────────────────────────────────────────

  seedProduct(p: OracleProduct) {
    this.products.set(p.id, { ...p });
  }

  seedSupplier(s: OracleSupplier) {
    this.suppliers.set(s.id, { ...s });
  }

  seedCustomer(c: OracleCustomer) {
    this.customers.set(c.id, { ...c });
  }

  seedCashBankAccount(a: OracleCashBankAccount) {
    this.cashBankAccounts.set(a.id, { ...a });
  }

  // ─── GETTERS ───────────────────────────────────────────────────────────────

  getProduct(id: string): OracleProduct | undefined {
    return this.products.get(id);
  }

  getSupplier(id: string): OracleSupplier | undefined {
    return this.suppliers.get(id);
  }

  getCustomer(id: string): OracleCustomer | undefined {
    return this.customers.get(id);
  }

  getCashBankAccount(id: string): OracleCashBankAccount | undefined {
    return this.cashBankAccounts.get(id);
  }

  // ─── INVENTORY ─────────────────────────────────────────────────────────────

  recordInventoryTransaction(tx: OracleInventoryTransaction) {
    this.inventoryTransactions.push(tx);
    const product = this.products.get(tx.productId);
    if (!product) throw new Error(`Oracle: product ${tx.productId} not found`);
    product.stockQuantity = roundQuantity(product.stockQuantity + tx.quantityChanged);
    if (product.stockQuantity < 0) {
      throw new Error(`Oracle: negative stock for ${product.name} (${product.stockQuantity})`);
    }
  }

  /** Apply GRN: increase stock, recalculate WAC. */
  applyGRN(productId: string, quantity: number, unitCost: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    const existingValue = product.costPrice * product.stockQuantity;
    const newValue = unitCost * quantity;
    const result = calculateWAC(existingValue, product.stockQuantity, newValue, quantity);
    product.stockQuantity = roundQuantity(result.qty);
    product.costPrice = roundMoney(result.wac);
    this.recordInventoryTransaction({
      productId,
      type: "PURCHASE_RECEIPT",
      quantityChanged: quantity,
      unitCost,
      reference: "",
    });
  }

  /** Apply GRN void: decrease stock. */
  applyGRNVoid(productId: string, quantity: number, unitCost: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    product.stockQuantity = roundQuantity(product.stockQuantity - quantity);
    if (product.stockQuantity < 0) {
      throw new Error(`Oracle: negative stock after GRN void for ${product.name}`);
    }
    this.recordInventoryTransaction({
      productId,
      type: "PURCHASE_CANCELLATION",
      quantityChanged: -quantity,
      unitCost,
      reference: "",
    });
  }

  /** Apply sale: decrease stock. */
  applySale(productId: string, quantity: number, costPrice: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    if (product.stockQuantity < quantity) {
      throw new Error(`Oracle: insufficient stock for ${product.name}: have ${product.stockQuantity}, need ${quantity}`);
    }
    product.stockQuantity = roundQuantity(product.stockQuantity - quantity);
    this.recordInventoryTransaction({
      productId,
      type: "SALE",
      quantityChanged: -quantity,
      unitCost: costPrice,
      reference: "",
    });
  }

  /** Apply sale cancellation: restore stock. */
  applySaleCancellation(productId: string, quantity: number, costPrice: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    product.stockQuantity = roundQuantity(product.stockQuantity + quantity);
    this.recordInventoryTransaction({
      productId,
      type: "SALE_CANCELLATION",
      quantityChanged: quantity,
      unitCost: costPrice,
      reference: "",
    });
  }

  /** Apply customer return: increase stock. */
  applyCustomerReturn(productId: string, quantity: number, costPrice: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    const existingValue = product.costPrice * product.stockQuantity;
    const newValue = costPrice * quantity;
    const result = calculateWAC(existingValue, product.stockQuantity, newValue, quantity);
    product.stockQuantity = roundQuantity(result.qty);
    product.costPrice = roundMoney(result.wac);
    this.recordInventoryTransaction({
      productId,
      type: "RETURN_IN",
      quantityChanged: quantity,
      unitCost: costPrice,
      reference: "",
    });
  }

  /** Apply supplier return: decrease stock. */
  applySupplierReturn(productId: string, quantity: number, costPrice: number) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Oracle: product ${productId} not found`);
    product.stockQuantity = roundQuantity(product.stockQuantity - quantity);
    if (product.stockQuantity < 0) {
      throw new Error(`Oracle: negative stock after supplier return for ${product.name}`);
    }
    this.recordInventoryTransaction({
      productId,
      type: "RETURN_OUT",
      quantityChanged: -quantity,
      unitCost: costPrice,
      reference: "",
    });
  }

  // ─── GENERAL LEDGER ────────────────────────────────────────────────────────

  recordGLEntry(entry: Omit<OracleGLEntry, "debit" | "credit"> & { debit?: number; credit?: number }) {
    this.glEntries.push({
      ...entry,
      debit: entry.debit ?? 0,
      credit: entry.credit ?? 0,
    });
  }

  /** Post a balanced GL entry set. */
  postBalancedGLEntries(entries: Array<Omit<OracleGLEntry, "debit" | "credit"> & { debit?: number; credit?: number }>) {
    const totalDebit = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredit = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
    assertBalanced(totalDebit, totalCredit, "Oracle GL posting");
    for (const entry of entries) {
      this.recordGLEntry(entry);
    }
  }

  /** Oracle records a purchase (GRN) to GL: DR Inventory, CR AP. */
  recordPurchaseGRNGL(grnId: string, grnNumber: string, date: Date, amount: number) {
    this.postBalancedGLEntries([
      { accountId: "INV", accountCode: "1200", accountName: "Inventory", sourceType: "PURCHASE_RECEIPT", sourceId: grnId, documentNo: grnNumber, date, narration: `Goods received ${grnNumber}`, debit: amount, credit: 0 },
      { accountId: "AP", accountCode: "2000", accountName: "Accounts Payable", sourceType: "PURCHASE_RECEIPT", sourceId: grnId, documentNo: grnNumber, date, narration: `Goods received ${grnNumber}`, debit: 0, credit: amount },
    ]);
  }

  /** Oracle records GRN void reversal to GL. */
  recordGRNVoidGL(grnId: string, grnNumber: string, date: Date, amount: number) {
    this.postBalancedGLEntries([
      { accountId: "AP", accountCode: "2000", accountName: "Accounts Payable", sourceType: "REVERSAL", sourceId: grnId, documentNo: `REV-${grnNumber}`, date, narration: `GRN void reversal ${grnNumber}`, debit: amount, credit: 0 },
      { accountId: "INV", accountCode: "1200", accountName: "Inventory", sourceType: "REVERSAL", sourceId: grnId, documentNo: `REV-${grnNumber}`, date, narration: `GRN void reversal ${grnNumber}`, debit: 0, credit: amount },
    ]);
  }

  /** Oracle records a sale to GL: DR AR, CR Revenue; DR COGS, CR Inventory. */
  recordSaleGL(saleId: string, orderNumber: string, date: Date, revenue: number, cogs: number) {
    const entries: Array<Omit<OracleGLEntry, "debit" | "credit"> & { debit?: number; credit?: number }> = [
      { accountId: "AR", accountCode: "1100", accountName: "Accounts Receivable", sourceType: "SALE", sourceId: saleId, documentNo: orderNumber, date, narration: `Sale ${orderNumber}`, debit: revenue, credit: 0 },
      { accountId: "REV", accountCode: "4000", accountName: "Sales Revenue", sourceType: "SALE", sourceId: saleId, documentNo: orderNumber, date, narration: `Sale ${orderNumber}`, debit: 0, credit: revenue },
    ];
    if (cogs > 0) {
      entries.push(
        { accountId: "COGS", accountCode: "5000", accountName: "Cost of Goods Sold", sourceType: "SALE", sourceId: saleId, documentNo: orderNumber, date, narration: `COGS ${orderNumber}`, debit: cogs, credit: 0 },
        { accountId: "INV", accountCode: "1200", accountName: "Inventory", sourceType: "SALE", sourceId: saleId, documentNo: orderNumber, date, narration: `Inventory issued ${orderNumber}`, debit: 0, credit: cogs },
      );
    }
    this.postBalancedGLEntries(entries);
  }

  /** Oracle records cash received with sale. */
  recordCashReceivedGL(saleId: string, orderNumber: string, date: Date, cashAccountId: string, amount: number) {
    this.postBalancedGLEntries([
      { accountId: cashAccountId, accountCode: "1000", accountName: "Cash", sourceType: "RECEIPT", sourceId: saleId, documentNo: orderNumber, date, narration: `Cash received with ${orderNumber}`, debit: amount, credit: 0 },
      { accountId: "AR", accountCode: "1100", accountName: "Accounts Receivable", sourceType: "RECEIPT", sourceId: saleId, documentNo: orderNumber, date, narration: `Cash received with ${orderNumber}`, debit: 0, credit: amount },
    ]);
    const cash = this.cashBankAccounts.get(cashAccountId);
    if (cash) cash.currentBalance = roundMoney(cash.currentBalance + amount);
  }

  /** Oracle records customer payment. */
  recordCustomerPaymentGL(paymentId: string, documentNo: string, date: Date, cashAccountId: string, amount: number) {
    this.postBalancedGLEntries([
      { accountId: cashAccountId, accountCode: "1000", accountName: "Cash", sourceType: "RECEIPT", sourceId: paymentId, documentNo, date, narration: `Customer receipt ${documentNo}`, debit: amount, credit: 0 },
      { accountId: "AR", accountCode: "1100", accountName: "Accounts Receivable", sourceType: "RECEIPT", sourceId: paymentId, documentNo, date, narration: `Customer receipt ${documentNo}`, debit: 0, credit: amount },
    ]);
    const cash = this.cashBankAccounts.get(cashAccountId);
    if (cash) cash.currentBalance = roundMoney(cash.currentBalance + amount);
  }

  /** Oracle records supplier payment. */
  recordSupplierPaymentGL(paymentId: string, documentNo: string, date: Date, cashAccountId: string, amount: number) {
    this.postBalancedGLEntries([
      { accountId: "AP", accountCode: "2000", accountName: "Accounts Payable", sourceType: "PAYMENT", sourceId: paymentId, documentNo, date, narration: `Supplier payment ${documentNo}`, debit: amount, credit: 0 },
      { accountId: cashAccountId, accountCode: "1000", accountName: "Cash", sourceType: "PAYMENT", sourceId: paymentId, documentNo, date, narration: `Supplier payment ${documentNo}`, debit: 0, credit: amount },
    ]);
    const cash = this.cashBankAccounts.get(cashAccountId);
    if (cash) cash.currentBalance = roundMoney(cash.currentBalance - amount);
  }

  /** Oracle records customer return GL. */
  recordCustomerReturnGL(returnId: string, documentNo: string, date: Date, amount: number, inventoryCost: number) {
    const entries: Array<Omit<OracleGLEntry, "debit" | "credit"> & { debit?: number; credit?: number }> = [
      { accountId: "REV", accountCode: "4000", accountName: "Sales Revenue", sourceType: "CUSTOMER_RETURN", sourceId: returnId, documentNo, date, narration: `Customer return ${documentNo}`, debit: amount, credit: 0 },
      { accountId: "AR", accountCode: "1100", accountName: "Accounts Receivable", sourceType: "CUSTOMER_RETURN", sourceId: returnId, documentNo, date, narration: `Customer return ${documentNo}`, debit: 0, credit: amount },
    ];
    if (inventoryCost > 0) {
      entries.push(
        { accountId: "INV", accountCode: "1200", accountName: "Inventory", sourceType: "CUSTOMER_RETURN", sourceId: returnId, documentNo, date, narration: `Returned inventory ${documentNo}`, debit: inventoryCost, credit: 0 },
        { accountId: "COGS", accountCode: "5000", accountName: "Cost of Goods Sold", sourceType: "CUSTOMER_RETURN", sourceId: returnId, documentNo, date, narration: `COGS reversal ${documentNo}`, debit: 0, credit: inventoryCost },
      );
    }
    this.postBalancedGLEntries(entries);
  }

  /** Oracle records supplier return GL. */
  recordSupplierReturnGL(returnId: string, documentNo: string, date: Date, amount: number) {
    this.postBalancedGLEntries([
      { accountId: "AP", accountCode: "2000", accountName: "Accounts Payable", sourceType: "SUPPLIER_RETURN", sourceId: returnId, documentNo, date, narration: `Supplier return ${documentNo}`, debit: amount, credit: 0 },
      { accountId: "INV", accountCode: "1200", accountName: "Inventory", sourceType: "SUPPLIER_RETURN", sourceId: returnId, documentNo, date, narration: `Supplier return ${documentNo}`, debit: 0, credit: amount },
    ]);
  }

  /** Oracle records expense. */
  recordExpenseGL(expenseId: string, voucherNumber: string, date: Date, expenseAccountId: string, paymentAccountId: string, amount: number) {
    this.postBalancedGLEntries([
      { accountId: expenseAccountId, accountCode: "6100", accountName: "Expense", sourceType: "EXPENSE", sourceId: expenseId, documentNo: voucherNumber, date, narration: `Expense ${voucherNumber}`, debit: amount, credit: 0 },
      { accountId: paymentAccountId, accountCode: "1000", accountName: "Cash", sourceType: "EXPENSE", sourceId: expenseId, documentNo: voucherNumber, date, narration: `Expense ${voucherNumber}`, debit: 0, credit: amount },
    ]);
    const cash = this.cashBankAccounts.get(paymentAccountId);
    if (cash) cash.currentBalance = roundMoney(cash.currentBalance - amount);
  }

  // ─── LEDGER ────────────────────────────────────────────────────────────────

  recordLedgerEntry(entry: OracleLedgerEntry) {
    this.ledgerEntries.push(entry);
  }

  // ─── PAYMENTS ──────────────────────────────────────────────────────────────

  recordPayment(payment: OraclePayment) {
    this.payments.push(payment);
  }

  // ─── BALANCE UPDATES ──────────────────────────────────────────────────────

  updateSupplierBalance(supplierId: string, delta: number) {
    const supplier = this.suppliers.get(supplierId);
    if (!supplier) throw new Error(`Oracle: supplier ${supplierId} not found`);
    supplier.currentBalance = roundMoney(supplier.currentBalance + delta);
  }

  updateCustomerBalance(customerId: string, delta: number) {
    const customer = this.customers.get(customerId);
    if (!customer) throw new Error(`Oracle: customer ${customerId} not found`);
    customer.currentBalance = roundMoney(customer.currentBalance + delta);
  }

  // ─── RECONCILIATION ────────────────────────────────────────────────────────

  /** Verify GL is balanced (total debits = total credits). */
  reconcileGL(): ReconciliationResult {
    const mismatches: string[] = [];
    // Group by source document
    const bySource = new Map<string, OracleGLEntry[]>();
    for (const entry of this.glEntries) {
      const key = `${entry.sourceType}:${entry.sourceId}`;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key)!.push(entry);
    }
    for (const [source, entries] of bySource) {
      const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.001) {
        mismatches.push(`Source ${source}: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`);
      }
    }
    return { passed: mismatches.length === 0, mismatches };
  }

  /** Verify customer balance = sum(ledger debits - credits). */
  reconcileCustomer(customerId: string): ReconciliationResult {
    const customer = this.customers.get(customerId);
    if (!customer) return { passed: false, mismatches: [`Customer ${customerId} not found`] };
    const entries = this.ledgerEntries.filter((e) => e.customerId === customerId);
    const ledgerBalance = entries.reduce((s, e) => s + e.debit - e.credit, 0);
    const diff = Math.abs(customer.currentBalance - ledgerBalance);
    if (diff > 0.001) {
      return { passed: false, mismatches: [`Customer ${customer.name}: balance ${customer.currentBalance.toFixed(2)} ≠ ledger ${ledgerBalance.toFixed(2)}`] };
    }
    return { passed: true, mismatches: [] };
  }

  /** Verify supplier balance = sum(ledger credits - debits). */
  reconcileSupplier(supplierId: string): ReconciliationResult {
    const supplier = this.suppliers.get(supplierId);
    if (!supplier) return { passed: false, mismatches: [`Supplier ${supplierId} not found`] };
    const entries = this.ledgerEntries.filter((e) => e.supplierId === supplierId);
    const ledgerBalance = entries.reduce((s, e) => s + e.credit - e.debit, 0);
    const diff = Math.abs(supplier.currentBalance - ledgerBalance);
    if (diff > 0.001) {
      return { passed: false, mismatches: [`Supplier ${supplier.name}: balance ${supplier.currentBalance.toFixed(2)} ≠ ledger ${ledgerBalance.toFixed(2)}`] };
    }
    return { passed: true, mismatches: [] };
  }

  /** Verify inventory transactions sum to current stock. */
  reconcileInventory(productId: string): ReconciliationResult {
    const product = this.products.get(productId);
    if (!product) return { passed: false, mismatches: [`Product ${productId} not found`] };
    const txs = this.inventoryTransactions.filter((t) => t.productId === productId);
    const calculatedStock = txs.reduce((s, t) => s + t.quantityChanged, 0);
    const diff = Math.abs(product.stockQuantity - calculatedStock);
    if (diff > 0.001) {
      return { passed: false, mismatches: [`Product ${product.name}: stock ${product.stockQuantity.toFixed(4)} ≠ calculated ${calculatedStock.toFixed(4)}`] };
    }
    return { passed: true, mismatches: [] };
  }

  /** Generate trial balance from oracle GL entries. */
  generateTrialBalance(): TrialBalance {
    const byAccount = new Map<string, { code: string; name: string; debit: number; credit: number }>();
    for (const entry of this.glEntries) {
      const key = entry.accountId;
      if (!byAccount.has(key)) byAccount.set(key, { code: entry.accountCode, name: entry.accountName, debit: 0, credit: 0 });
      const acc = byAccount.get(key)!;
      acc.debit += entry.debit;
      acc.credit += entry.credit;
    }
    const entries: TrialBalanceEntry[] = [...byAccount.values()].map((acc) => ({
      accountCode: acc.code,
      accountName: acc.name,
      category: "",
      normalBalance: acc.debit > acc.credit ? "DEBIT" : "CREDIT",
      debit: roundMoney(acc.debit),
      credit: roundMoney(acc.credit),
      balance: roundMoney(acc.debit - acc.credit),
    }));
    const totalDebits = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = entries.reduce((s, e) => s + e.credit, 0);
    return {
      entries,
      totalDebits: roundMoney(totalDebits),
      totalCredits: roundMoney(totalCredits),
      balanced: Math.abs(totalDebits - totalCredits) < 0.001,
    };
  }

  // ─── FULL RECONCILIATION ──────────────────────────────────────────────────

  reconcileAll(): ReconciliationResult {
    const mismatches: string[] = [];

    // GL balanced
    const glResult = this.reconcileGL();
    if (!glResult.passed) mismatches.push(...glResult.mismatches);

    // Customer reconciliation
    for (const [id] of this.customers) {
      const result = this.reconcileCustomer(id);
      if (!result.passed) mismatches.push(...result.mismatches);
    }

    // Supplier reconciliation
    for (const [id] of this.suppliers) {
      const result = this.reconcileSupplier(id);
      if (!result.passed) mismatches.push(...result.mismatches);
    }

    // Inventory reconciliation
    for (const [id] of this.products) {
      const result = this.reconcileInventory(id);
      if (!result.passed) mismatches.push(...result.mismatches);
    }

    // Trial balance
    const tb = this.generateTrialBalance();
    if (!tb.balanced) {
      mismatches.push(`Trial balance not balanced: debits ${tb.totalDebits.toFixed(2)} ≠ credits ${tb.totalCredits.toFixed(2)}`);
    }

    return { passed: mismatches.length === 0, mismatches };
  }
}
