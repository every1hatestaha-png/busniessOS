import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/assert-production-database-target.cjs");

function run(databaseUrl: string) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

describe("production database target assertion", () => {
  it("accepts the known production endpoint and compute host variants", () => {
    for (const host of [
      "ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech",
      "ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech",
      "ep-plain-smoke-b35qxc96-pql.c-4.ap-southeast-1.aws.neon.tech",
      "ep-plain-smoke-b35qxc96-pql-pooler.c-4.ap-southeast-1.aws.neon.tech",
    ]) {
      const result = run(`postgresql://user:secret@${host}/neondb?sslmode=require`);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Production database target assertion passed.");
    }
  });

  it("rejects development without printing its hostname or URL", () => {
    const host = "ep-icy-recipe-b3fwtekt-pooler.c-4.ap-southeast-1.aws.neon.tech";
    const result = run(`postgresql://user:super-secret@${host}/neondb?sslmode=require`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("classification=development");
    expect(result.stderr).not.toContain(host);
    expect(result.stderr).not.toContain("super-secret");
  });

  it("rejects unknown hosts with a non-secret fingerprint only", () => {
    const host = "example.invalid";
    const result = run(`postgresql://user:secret@${host}/neondb`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("classification=unknown");
    expect(result.stderr).toMatch(/hostFingerprint=[a-f0-9]{12}/);
    expect(result.stderr).not.toContain(host);
  });
});
