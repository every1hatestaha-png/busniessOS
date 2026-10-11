import "server-only";

import { notFound } from "next/navigation";

import { outboundGatePassWorkspaceAllowed } from "@/lib/delivery-acceptance/workspace-scope";

/**
 * The delivery-first draft flow is ONLY available to the explicitly configured
 * workspace. Even setting OUTBOUND_GATE_PASS_V1_ENABLED=true alone cannot expose
 * it to another tenant. No workspace name/email fallback is permitted.
 */
export function outboundGatePassDraftFeatureEnabled(workspaceId: string): boolean {
  return outboundGatePassWorkspaceAllowed(
    workspaceId,
    process.env.OUTBOUND_GATE_PASS_V1_ENABLED,
    process.env.OUTBOUND_GATE_PASS_V1_WORKSPACE_ID,
  );
}

export function requireOutboundGatePassDraftFeature(workspaceId: string): void {
  if (!outboundGatePassDraftFeatureEnabled(workspaceId)) notFound();
}
