/**
 * Exact tenant allowlist for the optional outbound gate-pass draft workflow.
 * An explicit, canonical workspace UUID is required. Workspace display names,
 * users, roles, emails, and permissive prefix matching are never accepted.
 *
 * This function is pure so the guard can be independently regression-tested.
 */
export function outboundGatePassWorkspaceAllowed(
  workspaceId: string,
  enabled: string | undefined,
  allowedWorkspaceId: string | undefined,
): boolean {
  if (enabled !== "true" || !allowedWorkspaceId) return false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return uuid.test(allowedWorkspaceId) && uuid.test(workspaceId)
    && workspaceId === allowedWorkspaceId;
}
