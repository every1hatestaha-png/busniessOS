import "server-only";

import { notFound } from "next/navigation";

// Default OFF. Enable only after the additive migration has passed isolated
// verification, and only in explicitly approved environments.
export function requireOutboundGatePassDraftFeature() {
  if (process.env.OUTBOUND_GATE_PASS_V1_ENABLED !== "true") notFound();
}

export function outboundGatePassDraftFeatureEnabled() {
  return process.env.OUTBOUND_GATE_PASS_V1_ENABLED === "true";
}
