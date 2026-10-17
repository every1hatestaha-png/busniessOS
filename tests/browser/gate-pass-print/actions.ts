// Browser-only synthetic adapter: never calls a backend or writes business data.
let calls = 0;
export function invoiceCallCount() { return calls; }
export async function invoiceGatePassAction() {
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { error: "Synthetic verification only; no invoice was created." };
}
