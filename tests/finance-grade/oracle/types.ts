/**
 * Types for the independent accounting oracle.
 * The oracle tracks expected state independently of BusinessOS.
 */

export interface OracleProduct {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  unit: string;
}

export interface OracleSupplier {
  id: string;
  name: string;
  currentBalance: number; // what we owe them (credit balance)
}

export interface OracleCustomer {
  id: string;
  name: string;
  currentBalance: number; // what they owe us (debit balance)
}

export interface OracleCashBankAccount {
  id: string;
  accountId: string;
  name: string;
  isBank: boolean;
  openingBalance: number;
  currentBalance: number;
}

export interface OracleGLEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  sourceType: string;
  sourceId: string;
  documentNo: string;
  date: Date;
  narration: string;
  debit: number;
  credit: number;
}

export interface OracleInventoryTransaction {
  productId: string;
  type: string;
  quantityChanged: number;
  unitCost: number | null;
  reference: string;
}

export interface OracleLedgerEntry {
  customerId?: string;
  supplierId?: string;
  type: string;
  debit: number;
  credit: number;
  description: string;
  referenceId: string;
}

export interface OraclePayment {
  id: string;
  customerId?: string;
  supplierId?: string;
  invoiceId?: string;
  cashBankAccountId?: string;
  amount: number;
  method: string;
  isReversed: boolean;
  reversalOfId?: string;
}

export interface OracleSnapshot {
  products: Map<string, OracleProduct>;
  suppliers: Map<string, OracleSupplier>;
  customers: Map<string, OracleCustomer>;
  cashBankAccounts: Map<string, OracleCashBankAccount>;
  glEntries: OracleGLEntry[];
  inventoryTransactions: OracleInventoryTransaction[];
  ledgerEntries: OracleLedgerEntry[];
  payments: OraclePayment[];
}

export interface ReconciliationResult {
  passed: boolean;
  mismatches: string[];
}

export interface TrialBalanceEntry {
  accountCode: string;
  accountName: string;
  category: string;
  normalBalance: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  entries: TrialBalanceEntry[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
}
