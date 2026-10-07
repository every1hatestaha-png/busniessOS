import { describe, expect, it } from "vitest";
import { parse } from "pg-connection-string";

import production from "@/config/database-targets.json";
import staging from "@/config/staging-database-targets.json";
import { assertApprovedProductionDatabaseTarget, classifyDatabaseTarget } from "@/lib/database-target";
import { assertApprovedStagingDatabaseTarget } from "@/lib/staging-database-target";

const approvedEnvironment = {
  MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "staging",
  VERCEL: "1",
  VERCEL_PROJECT_ID: staging.vercelProjectId,
};
const url = (host: string) => `postgresql://synthetic:synthetic@${host}/neondb?sslmode=verify-full`;

describe("separate staging readiness policy", () => {
  it.each(staging.hosts)("allows only the approved staging endpoint in the explicit staging project", (host) => {
    expect(() => assertApprovedStagingDatabaseTarget(url(host), approvedEnvironment)).not.toThrow();
    expect(() => assertApprovedProductionDatabaseTarget(url(host))).toThrow("Production database target rejected");
    expect(classifyDatabaseTarget(url(host))).toEqual({ classification: "unknown", approved: false });
  });

  it.each([
    {},
    { ...approvedEnvironment, MUNSHIOS_DEPLOYMENT_ENVIRONMENT: undefined },
    { ...approvedEnvironment, MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "production" },
    { ...approvedEnvironment, MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "preview" },
    { ...approvedEnvironment, VERCEL: undefined },
    { ...approvedEnvironment, VERCEL: "0" },
    { ...approvedEnvironment, VERCEL_PROJECT_ID: undefined },
    { ...approvedEnvironment, VERCEL_PROJECT_ID: "prj_different_project" },
  ])("rejects missing or mismatched deployment context before allowing staging", (environment) => {
    expect(() => assertApprovedStagingDatabaseTarget(url(staging.hosts[0]), environment)).toThrow("deployment context");
  });

  it.each([
    undefined,
    "not-a-url",
    `https://${staging.hosts[0]}/neondb`,
    `postgresql://synthetic:synthetic@${staging.hosts[0]}/other`,
    `postgresql://synthetic:synthetic@${staging.hosts[0]}/%ZZ`,
    `postgresql://synthetic:synthetic@${staging.hosts[0]}:5433/neondb`,
    `postgresql://synthetic:synthetic@${staging.hosts[0]}.attacker.example/neondb`,
    "postgresql://synthetic:synthetic@unknown.example/neondb",
    ...production.productionHosts.map(url),
    ...production.developmentHosts.map(url),
  ])("rejects malformed, wrong-database, arbitrary, development and production targets in staging", (value) => {
    expect(() => assertApprovedStagingDatabaseTarget(value, approvedEnvironment)).toThrow("Staging database target rejected: endpoint");
  });

  it.each(production.productionHosts)("preserves every production endpoint variant", (host) => {
    expect(() => assertApprovedProductionDatabaseTarget(url(host))).not.toThrow();
  });

  it("accepts the supported postgres protocol and explicit standard port", () => {
    expect(() => assertApprovedStagingDatabaseTarget(`postgres://synthetic:synthetic@${staging.hosts[0]}:5432/neondb`, approvedEnvironment)).not.toThrow();
  });

  it("rejects a query host override that the Postgres driver would use instead of the approved URL host", () => {
    const value = `${url(staging.hosts[0])}&host=unknown.example`;
    expect(parse(value).host).toBe("unknown.example");
    expect(() => assertApprovedStagingDatabaseTarget(value, approvedEnvironment)).toThrow("endpoint");
  });

  it.each(["hostaddr", "port", "database", "dbname", "service", "connectionString"])(
    "rejects routing overrides even when the authority host is approved",
    (parameter) => {
      expect(() => assertApprovedStagingDatabaseTarget(`${url(staging.hosts[0])}&${parameter}=synthetic-override`, approvedEnvironment)).toThrow("endpoint");
    },
  );
});
