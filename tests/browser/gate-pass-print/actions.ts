// Browser-only synthetic adapter: never calls a backend or writes business data.
let calls = 0;
let issueCalls = 0;
export function invoiceCallCount() { return calls; }
export function issueCallCount() { return issueCalls; }
export async function issueGatePassAction(_: unknown, form: FormData) {
  for (const key of ["ownerTaxTimingAssessed", "ownerNoEarlierInvoiceObligation", "ownerResponsibilityAcknowledged"]) {
    if (form.get(key) !== "yes") throw new Error("Synthetic owner consent was lost from the submitted FormData");
  }
  issueCalls++;
  await new Promise(resolve => setTimeout(resolve, 500));
  return { error: "Synthetic declaration verification only; no stock or audit record was created." };
}
export async function dispatchGatePassAction() { return {}; }
export async function cancelGatePassAction() { return {}; }
export async function receivingGatePassAction() { return {}; }
export async function returnedGatePassAction() { return {}; }
export async function invoiceGatePassAction() {
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { error: "Synthetic verification only; no invoice was created." };
}
