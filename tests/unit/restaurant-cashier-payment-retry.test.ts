import { describe, expect, it } from "vitest";
import { cashierPaymentSignature } from "@/lib/restaurant/cashier-payment-retry";

function makePayment(id = "rp:paid-once", amount = "40") {
  const data = new FormData();
  data.set("formWorkspaceId", "restaurant-a");
  data.set("orderId", "order-a");
  data.set("paymentRequestId", id);
  data.set("method", "BANK_TRANSFER");
  data.set("amount", amount);
  data.set("cashBankAccountId", "bank-a");
  data.set("reference", "T-100");
  return data;
}
describe("Cashier payment retry identity", () => {
  it("retains the same identity for an unchanged retry", () => {
    const data = makePayment();
    const first = cashierPaymentSignature(data);
    data.set("paymentRequestId", "rp:another-request-id");
    expect(cashierPaymentSignature(data)).toBe(first);
  });
  it.each([
    ["amount", "41"],
    ["method", "CASH"],
    ["cashBankAccountId", "drawer-a"],
    ["reference", "T-200"],
    ["formWorkspaceId", "restaurant-b"],
    ["orderId", "order-b"],
  ])("a changed %s requires a new payment request", (field, value) => {
    const a = makePayment();
    const b = makePayment();
    b.set(field, value);
    expect(cashierPaymentSignature(a)).not.toBe(cashierPaymentSignature(b));
  });
  it("is independent of FormData field append order", () => {
    const a = makePayment();
    const b = new FormData();
    for (const [key, value] of [...a.entries()].reverse()) b.set(key, value);
    expect(cashierPaymentSignature(a)).toBe(cashierPaymentSignature(b));
  });
});
