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

  it("does not deploy application code until production migrations succeed", () => {
    expect(workflow).toContain("needs:\n      - build\n      - migrate-production");
  });

  it("verifies the deployed runtime database after release", () => {
    expect(workflow).toContain("/api/readiness");
    expect(workflow).toContain("MunshiOS runtime database readiness verified.");
    expect(runtimeReadiness).toContain("assertApprovedProductionDatabaseTarget(process.env.DATABASE_URL)");
  });
});
