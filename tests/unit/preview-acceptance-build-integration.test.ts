import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The npx binary is replaced with a local interceptor. This suite cannot
// start Next.js, contact a provider or run Prisma migrations.
function simulateBuild(overrides: Record<string, string | undefined>) {
  const dir = mkdtempSync(join(tmpdir(), "munshios-preview-preflight-"));
  try {
    const isWindows = process.platform === "win32";
    writeFileSync(join(dir, isWindows ? "npx.cmd" : "npx"), isWindows
      ? "@echo off\r\necho intercepted-command:%*\r\n"
      : "#!/bin/sh\nprintf 'intercepted-command:%s\\n' \"$*\"\n", { mode: 0o755 });
    const env = {
      ...process.env,
      PATH: `${dir}${delimiter}${process.env.PATH}`,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "prj_ytXqF1zAoJjcsBIICz7PryfAczLz",
      VERCEL_GIT_COMMIT_REF: "integrate/security-stack-on-marketing-20261009",
      MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "staging",
      RUN_PRISMA_MIGRATIONS_ON_BUILD: "0",
      DATABASE_URL: "postgresql://fixture:nonpublic-staging-fixture@ep-clean-synthetic-b5safe123.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ...overrides,
    };
    return spawnSync(process.execPath, [resolve("scripts/production-build.cjs")], { encoding: "utf8", env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("candidate Preview guard integrated into actual build entrypoint", () => {
  it("rejects the release candidate before invoking Next or Prisma with an unapproved Preview URL", () => {
    const result = simulateBuild({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing acceptance deployment");
    expect(result.stdout).not.toContain("intercepted-command:");
    expect(result.stderr).not.toContain("nonpublic-staging-fixture");
  });

  it.each([
    ["generic-root", { DATABASE_URL: "postgresql://fixture:fixture@ep-fragrant-heart-b578tydw.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require" }],
    ["missing-staging-marker", { MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "" }],
    ["wrong-project", { VERCEL_PROJECT_ID: "prj_iSQ7PaTAwiQMYasVAEBGJZTSjTk2" }],
    ["missing-migration-off-flag", { RUN_PRISMA_MIGRATIONS_ON_BUILD: undefined }],
    ["wrong-env", { VERCEL_ENV: "development" }],
  ])("denies %s without running build commands", (_, override) => {
    const result = simulateBuild(override);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("intercepted-command:");
  });

  it.each(["main", undefined])("rejects an unapproved staging-project build with an unrelated or missing Git ref (%s)", (ref) => {
    const result = simulateBuild({ VERCEL_GIT_COMMIT_REF: ref });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("intercepted-command:");
  });

  it("allows reviewed sterile Neon host but never invokes Prisma migrations", () => {
    const result = simulateBuild({
      DATABASE_URL: "postgresql://synthetic:fixture@ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("intercepted-command:next build");
    expect(result.stdout).not.toContain("prisma migrate deploy");
  });

  it("preserves unrelated business-os Preview builds when build-time migrations are off", () => {
    const result = simulateBuild({
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_PROJECT_ID: "prj_iSQ7PaTAwiQMYasVAEBGJZTSjTk2",
      MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("intercepted-command:next build");
    expect(result.stdout).not.toContain("prisma migrate deploy");
  });
});
