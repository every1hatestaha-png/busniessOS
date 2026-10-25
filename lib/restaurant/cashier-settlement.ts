/**
 * Prevent cashier method/account mismatches at the selection UI.
 * Database constraints and the server payment service independently enforce this.
 */
export function eligibleCashierSettlementAccounts<T extends { isBank: boolean }>(
  accounts: readonly T[],
  method: string,
): T[] {
  return accounts.filter(account => account.isBank === (method !== "CASH"));
}
