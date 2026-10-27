import { describe, expect, it } from "vitest";

import { eligibleCashierSettlementAccounts } from "@/lib/restaurant/cashier-settlement";

const accounts = [
  { cashBankAccountId: "drawer-a", name: "Cash Drawer", isBank: false },
  { cashBankAccountId: "bank-b", name: "Bank Settlement", isBank: true },
  { cashBankAccountId: "wallet-c", name: "Digital Wallet", isBank: true },
];

describe("cashier settlement selection", () => {
  it("only offers a physical drawer when recording cash", () => {
    expect(eligibleCashierSettlementAccounts(accounts, "CASH").map(x => x.cashBankAccountId))
      .toEqual(["drawer-a"]);
  });

  it.each(["CREDIT_CARD", "BANK_TRANSFER", "CHEQUE", "JAZZCASH", "EASYPAISA", "MOBILE_WALLET", "OTHER"])(
    "only offers digital/bank settlement accounts for %s", method => {
      expect(eligibleCashierSettlementAccounts(accounts, method).map(x => x.cashBankAccountId))
        .toEqual(["bank-b", "wallet-c"]);
    },
  );

  it("refuses to offer an incompatible settlement account", () => {
    expect(eligibleCashierSettlementAccounts(accounts.filter(x => x.isBank), "CASH")).toEqual([]);
    expect(eligibleCashierSettlementAccounts(accounts.filter(x => !x.isBank), "JAZZCASH")).toEqual([]);
  });
});
