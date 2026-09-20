import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("production release workflow", () => {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/main_munshios.yml"), "utf8");
  const targetAssertion = readFileSync(join(process.cwd(), "scripts/assert-production-database-target.cjs"), "utf8");
  const runtimeReadiness = readFileSync(join(process.cwd(), "lib/server/database-readiness.ts"), "utf8");
  const targetConfig = readFileSync(join(process.cwd(), "config/database-targets.json"), "utf8");

  it("migrates production only after an explicit production-target assertion", () => {
    expect(workflow).toContain("migrate-production:");
    expect(workflow).toContain("node scripts/assert-production-database-target.cjs");
    expect(workflow).toContain("npx prisma migrate deploy");
    expect(workflow).toContain("npx prisma migrate status");
    expect(targetConfig).toContain("ep-plain-smoke-b35qxc96");
    expect(targetAssertion).toContain("development: new Set");
    expect(targetAssertion).toContain("classification !== \"production\"");
  });

  it("uses Vercel as the only production application host", () => {
    expect(workflow).toContain("verify-vercel-production:");
    expect(workflow).toContain("https://business-os-one-gules.vercel.app/api/readiness");
    expect(workflow).not.toContain("azure/webapps-deploy");
    expect(workflow).not.toContain("azurewebsites.net");
  });

  it("verifies the exact Vercel revision and runtime database after release", () => {
    expect(workflow).toContain("needs:\n      - build\n      - migrate-production");
    expect(workflow).toContain("/api/readiness");
    expect(workflow).toContain('expected_revision="${GITHUB_SHA:0:12}"');
    expect(workflow).toContain('body.revision === process.env.EXPECTED_REVISION');
    expect(workflow).toContain("MunshiOS Vercel revision and production database readiness verified.");
    expect(runtimeReadiness).toContain("assertApprovedProductionDatabaseTarget(process.env.DATABASE_URL)");
  });
});
