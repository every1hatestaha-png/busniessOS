import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertPreviewAcceptanceTarget } = require("../../scripts/assert-preview-acceptance-target.cjs");
const fixtureHost = "ep-clean-synthetic-b5safe123.c-7.us-east-2.aws.neon.tech";
const base = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "integrate/security-stack-on-marketing-20261009",
  VERCEL_PROJECT_ID: "prj_ytXqF1zAoJjcsBIICz7PryfAczLz",
  MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "staging",
  RUN_PRISMA_MIGRATIONS_ON_BUILD: "0",
  DATABASE_URL: `postgresql://user:private-fixture-password@${fixtureHost}/neondb?sslmode=require`,
};

describe("release candidate Preview acceptance database guard", () => {
  it("rejects all release deployments while the reviewed synthetic-host allowlist is empty", () => {
    expect(() => assertPreviewAcceptanceTarget(base)).toThrow("not an independently approved synthetic");
  });
  it("allows only an explicitly reviewed clean synthetic target in a unit-test injection", () => {
    expect(assertPreviewAcceptanceTarget(base, [fixtureHost])).toEqual({ candidatePreviewGuard: "approved" });
  });
  it.each([
    { VERCEL_ENV: "production" },
    { VERCEL_PROJECT_ID: "prj_iSQ7PaTAwiQMYasVAEBGJZTSjTk2" },
    { MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "" },
    { RUN_PRISMA_MIGRATIONS_ON_BUILD: "1" },
    { RUN_PRISMA_MIGRATIONS_ON_BUILD: undefined },
  ])("rejects incorrect hosting context before database connection: %j", override => {
    expect(() => assertPreviewAcceptanceTarget({ ...base, ...override }, [fixtureHost])).toThrow();
  });
  it.each([
    `postgresql://user:secret@ep-fragrant-heart-b578tydw.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
    `postgresql://user:secret@ep-muddy-sea-b51k2gi3.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
    `postgresql://user:secret@ep-fragrant-sun-b5xzle76.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
  ])("rejects known staging root / previous data-bearing branches even when injected as approved", url => {
    const hostname = new URL(url).hostname;
    expect(() => assertPreviewAcceptanceTarget({ ...base, DATABASE_URL: url }, [hostname])).toThrow();
  });
  it.each([
    "",
    "bad-url",
    base.DATABASE_URL.replace("postgresql:", "https:"),
    base.DATABASE_URL.replace("/neondb", "/other"),
    base.DATABASE_URL.replace("sslmode=require", "sslmode=disable"),
    base.DATABASE_URL + "&schema=private",
    base.DATABASE_URL + "&host=evil.example",
    base.DATABASE_URL + "&options=evil",
    base.DATABASE_URL.replace("/neondb", ":5433/neondb"),
    base.DATABASE_URL.replace("c-7.us-east-2", "c-4.ap-southeast-1"),
  ])("rejects invalid or route-overridden database URLs before any connection: %s", url => {
    expect(() => assertPreviewAcceptanceTarget({ ...base, DATABASE_URL: url }, [fixtureHost])).toThrow();
  });
  it("does not gate ordinary unrelated builds, but guards both approved candidate refs", () => {
    expect(assertPreviewAcceptanceTarget({ ...base, VERCEL: "0" })).toEqual({ candidatePreviewGuard: "not-applicable" });
    expect(() => assertPreviewAcceptanceTarget({ ...base, VERCEL_GIT_COMMIT_REF: "main" })).toThrow();
    expect(() => assertPreviewAcceptanceTarget({ ...base, VERCEL_GIT_COMMIT_REF: undefined })).toThrow();
    expect(assertPreviewAcceptanceTarget({ ...base, VERCEL_GIT_COMMIT_REF: "main", VERCEL_PROJECT_ID: "prj_iSQ7PaTAwiQMYasVAEBGJZTSjTk2" })).toEqual({ candidatePreviewGuard: "not-applicable" });
    expect(() => assertPreviewAcceptanceTarget({ ...base, VERCEL_GIT_COMMIT_REF: "fix/preview-acceptance-fail-closed-20261009" })).toThrow();
  });
  it("does not reveal database passwords in errors", () => {
    expect(() => assertPreviewAcceptanceTarget({ ...base, DATABASE_URL: "secret-sensitive-value" })).toThrow(/valid database target/);
    try { assertPreviewAcceptanceTarget(base); }
    catch (err) { expect(String(err)).not.toContain("private-fixture-password"); }
  });
});
