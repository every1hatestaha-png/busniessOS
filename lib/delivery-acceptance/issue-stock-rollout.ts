/**
 * The V2 stock movement is an explicit future-only opt-in.  A Gate Pass made
 * before the production cutover retains its legacy dispatch-time stock rule,
 * even if its DRAFT is issued after V2 is enabled.
 *
 * Use the immutable database creation time, never the editable document date.
 * A missing/invalid cutover must not silently switch historical drafts to V2.
 */
export type GatePassIssueStockMode = "legacy" | "v2" | "misconfigured";

/** Read-only stock preview: V2 before ISSUE, legacy only after document ISSUE. */
export function needsGatePassStockPreview(
  status: string,
  stockAlreadyDeducted: boolean,
  mode: GatePassIssueStockMode,
): boolean {
  return !stockAlreadyDeducted && (status === "ISSUED" || (status === "DRAFT" && mode === "v2"));
}

export function gatePassIssueStockMode(
  createdAt: Date,
  enabled: string | undefined,
  cutoverAt: string | undefined,
): GatePassIssueStockMode {
  if (enabled !== "true") return "legacy";

  // Require one unambiguous UTC instant when the rollout is explicitly enabled.
  if (!cutoverAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutoverAt)) {
    return "misconfigured";
  }
  const cutoverMs = Date.parse(cutoverAt);
  if (!Number.isFinite(cutoverMs) || new Date(cutoverMs).toISOString() !== cutoverAt ||
      !Number.isFinite(createdAt.getTime())) {
    return "misconfigured";
  }

  return createdAt.getTime() >= cutoverMs ? "v2" : "legacy";
}
