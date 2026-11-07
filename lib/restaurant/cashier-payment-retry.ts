/** Immutable settlement payload signature for one logical cashier payment request.
 * The idempotency identity itself is excluded, since the server owns replay safety.
 * Each change to amount, method, bank account, workspace or reference changes this.
 */
export function cashierPaymentSignature(form: FormData): string {
  return JSON.stringify(
    [...form.entries()]
      .filter(([key]) => key !== "paymentRequestId")
      .map(([key, value]) => [key, typeof value === "string" ? value : value.name])
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB)),
  );
}
