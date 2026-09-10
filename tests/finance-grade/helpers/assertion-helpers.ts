/**
 * Financial assertion helpers for finance-grade tests.
 * These produce detailed error messages for failed assertions.
 */

import { assertMoneyEqual, assertQuantityEqual, assertBalanced } from "../oracle/precision";

export interface AssertionError {
  field: string;
  expected: number;
  actual: number;
  message: string;
}

export function collectErrors(): AssertionError[] {
  const errors: AssertionError[] = [];
  return errors;
}

export function check(errors: AssertionError[], field: string, actual: number, expected: number, tolerance = 0.001) {
  if (Math.abs(actual - expected) > tolerance) {
    errors.push({
      field,
      expected,
      actual,
      message: `${field}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}, diff ${(actual - expected).toFixed(4)}`,
    });
  }
}

export function assertNoErrors(errors: AssertionError[]) {
  if (errors.length > 0) {
    const summary = errors.map((e) => `  - ${e.message}`).join("\n");
    throw new Error(`Financial assertion failures (${errors.length}):\n${summary}`);
  }
}

/** Verify GL balanced and throw with details if not. */
export async function verifyGLBalancedOrThrow(
  getGLEntries: () => Promise<{ debit: any; credit: any }[]>,
  label = ""
) {
  const entries = await getGLEntries();
  const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0);
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0);
  assertBalanced(totalDebit, totalCredit, label);
}

/** Verify a customer's DB balance matches expected. */
export async function verifyCustomerBalance(
  actual: number,
  expected: number,
  customerName = ""
) {
  assertMoneyEqual(actual, expected, 0.001, `Customer ${customerName} balance`);
}

/** Verify a supplier's DB balance matches expected. */
export async function verifySupplierBalance(
  actual: number,
  expected: number,
  supplierName = ""
) {
  assertMoneyEqual(actual, expected, 0.001, `Supplier ${supplierName} balance`);
}

/** Verify product stock matches expected. */
export async function verifyProductStock(
  actual: number,
  expected: number,
  productName = ""
) {
  assertQuantityEqual(actual, expected, `Product ${productName} stock`);
}

/** Verify cash balance matches expected. */
export async function verifyCashBalance(
  actual: number,
  expected: number,
  accountName = ""
) {
  assertMoneyEqual(actual, expected, 0.001, `Cash ${accountName} balance`);
}
