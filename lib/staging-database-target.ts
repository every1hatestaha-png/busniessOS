import target from "@/config/staging-database-targets.json";

type StagingReadinessEnvironment = {
  MUNSHIOS_DEPLOYMENT_ENVIRONMENT?: string;
  VERCEL?: string;
  VERCEL_PROJECT_ID?: string;
};

const hosts = new Set(target.hosts);
const routingParameters = new Set(["host", "hostaddr", "port", "database", "dbname", "service", "connectionstring"]);

export function assertApprovedStagingDatabaseTarget(
  value: string | undefined,
  environment: StagingReadinessEnvironment,
) {
  if (
    environment.MUNSHIOS_DEPLOYMENT_ENVIRONMENT !== "staging" ||
    environment.VERCEL !== "1" ||
    environment.VERCEL_PROJECT_ID !== target.vercelProjectId
  ) {
    throw new Error("Staging database target rejected: deployment context.");
  }

  let parsed: URL;
  try {
    if (!value) throw new Error("Missing target");
    parsed = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !hosts.has(parsed.hostname.toLowerCase()) ||
      decodeURIComponent(parsed.pathname.replace(/^\//, "")) !== target.database ||
      (parsed.port && parsed.port !== "5432") ||
      [...parsed.searchParams.keys()].some((key) => routingParameters.has(key.toLowerCase()))
    ) {
      throw new Error("Unapproved target");
    }
  } catch {
    throw new Error("Staging database target rejected: endpoint.");
  }
}
