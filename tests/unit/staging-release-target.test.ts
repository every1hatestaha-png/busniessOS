import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assertStagingTarget, assertPolicySchemaState } = require("../../scripts/assert-staging-database-target.cjs");
const env = {
  VERCEL_ENV: "preview", VERCEL: "1", MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_PROJECT_ID: "prj_ytXqF1zAoJjcsBIICz7PryfAczLz",
  DATABASE_URL: "postgresql://synthetic:synthetic@ep-fragrant-heart-b578tydw-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require",
};
describe("explicit staging release database guard", () => {
  it("rejects prepared DDL with a pending ledger entry before attempting migration", () => {
    const columns = ["termsAcceptedAt", "termsVersion", "privacyAcknowledgedAt", "privacyVersion"].map(column_name => ({ column_name }));
    expect(() => assertPolicySchemaState(["20261007183000_user_policy_acceptance"], [])).not.toThrow();
    expect(() => assertPolicySchemaState([], columns)).not.toThrow();
    expect(() => assertPolicySchemaState(["20261007183000_user_policy_acceptance"], columns)).toThrow();
    expect(() => assertPolicySchemaState([], columns.slice(1))).toThrow();
  });
  it("maps only verified staging endpoints to their branch without returning credentials", () => {
    const target = assertStagingTarget(env);
    expect(target.branch).toBe("br-delicate-credit-b5lttgnc");
    expect(JSON.stringify(target)).not.toContain("synthetic");
  });
  it("also recognizes the verified disposable staging branch", () => {
    expect(assertStagingTarget({ ...env, DATABASE_URL: env.DATABASE_URL.replace("ep-fragrant-heart-b578tydw-pooler", "ep-fragrant-sun-b5xzle76") }).branch).toBe("br-dry-mouse-b5kctz0n");
  });
  it.each([
    { VERCEL_ENV: "production" }, { VERCEL: "0" }, { MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "production" }, { VERCEL_PROJECT_ID: "another-project" },
    { DATABASE_URL: "postgresql://synthetic:synthetic@ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb" },
    { DATABASE_URL: env.DATABASE_URL.replace("/neondb", "/other") },
    { DATABASE_URL: env.DATABASE_URL + "&schema=other" }, { DATABASE_URL: "invalid" },
    { DATABASE_URL: env.DATABASE_URL + "&host=unknown.example" },
    { DATABASE_URL: env.DATABASE_URL + "&connectionString=synthetic" },
    { DATABASE_URL: env.DATABASE_URL + "&options=synthetic" },
    { DATABASE_URL: env.DATABASE_URL.replace("/neondb", ":5433/neondb") },
  ])("fails closed before database access for %j", override => {
    expect(() => assertStagingTarget({ ...env, ...override })).toThrow();
  });
});
