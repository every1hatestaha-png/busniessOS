/**
 * Paid-only onboarding rules. The allowlist is keyed by immutable workspace IDs,
 * never by a signup email (which would let owners create free new businesses).
 */
export const PROTECTED_LEGACY_WORKSPACE_IDS = new Set([
  "c15e0dd4-9d61-407b-a4dc-5490e2247151", // KHZR
  "4bc313cf-2869-4d87-8f1e-22a147f18d2d", // Arshad Sons 625arshad
  "a9e7ed7d-d3c2-434a-992e-972fb088273a", // Arshad Sons hafizahmadarshad3
]);

// Matches the published PKR 29,000 setup + PKR 5,000 initial month.
export const MIN_INITIAL_PAYMENT_PKR = 34_000;

export function isProtectedLegacyWorkspace(workspaceId: string): boolean {
  return PROTECTED_LEGACY_WORKSPACE_IDS.has(workspaceId);
}

export class PaymentRequiredError extends Error {
  constructor() {
    super("Payment verification is required before a new MunshiOS workspace can be created.");
    this.name = "PaymentRequiredError";
  }
}
