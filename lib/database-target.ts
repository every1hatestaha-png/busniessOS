import targets from "@/config/database-targets.json";

export type DatabaseTargetClassification = "production" | "development" | "unknown";

export type DatabaseTarget = {
  classification: DatabaseTargetClassification;
  approved: boolean;
};

const productionHosts = new Set(targets.productionHosts);
const developmentHosts = new Set(targets.developmentHosts);

export function classifyDatabaseTarget(value: string | undefined): DatabaseTarget {
  if (!value) return { classification: "unknown", approved: false };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { classification: "unknown", approved: false };
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    return { classification: "unknown", approved: false };
  }

  const hostname = parsed.hostname.toLowerCase();
  const classification = productionHosts.has(hostname)
    ? "production"
    : developmentHosts.has(hostname)
      ? "development"
      : "unknown";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  return {
    classification,
    approved: classification === "production" && database === targets.database,
  };
}

export function assertApprovedProductionDatabaseTarget(value: string | undefined) {
  const target = classifyDatabaseTarget(value);
  if (!target.approved) {
    throw new Error(`Production database target rejected: ${target.classification}.`);
  }
}
