import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// All commands are intercepted. No database or provider connection is possible.
function runBuildGuard(migrations: string, overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "restaurant-build-guard-"));
  try {
    const windows = process.platform === "win32";
    writeFileSync(join(directory, windows ? "npx.cmd" : "npx"), windows
      ? '@echo off\r\necho intercepted-command:%*\r\n'
      : '#!/bin/sh\nprintf "intercepted-command:%s\\n" "$*"\n', { mode: 0o755 });
    return spawnSync(process.execPath, [resolve("scripts/production-build.cjs")], { encoding: "utf8", env: {
      ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`, VERCEL_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_restaurant_release_guard",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_synthetic_fixture", CLERK_SECRET_KEY: "sk_live_synthetic_fixture",
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/synthetic?sslmode=disable",
      RUN_PRISMA_MIGRATIONS_ON_BUILD: migrations,
      ...overrides,
    } });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("Restaurant V1.88 release migration build target guard", () => {
  it("rejects a wrong database before a production migration-on-build command", () => {
    const result = runBuildGuard("1");
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("intercepted-command:prisma migrate deploy");
    expect(result.stderr).toContain("Refusing production migration");
  });
  it("leaves ordinary builds free of migration side effects", () => {
    const result = runBuildGuard("0");
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("prisma migrate deploy");
    expect(result.stdout).toContain("intercepted-command:next build");
  });
  it("denies a Preview migration when the staging marker is missing", () => {
    const result = runBuildGuard("1", {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "prj_ytXqF1zAoJjcsBIICz7PryfAczLz",
      MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("intercepted-command:prisma migrate deploy");
    expect(result.stderr).toContain("Refusing staging migration");
  });

  it("denies a Preview migration targeting an unapproved database", () => {
    const result = runBuildGuard("1", {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "prj_ytXqF1zAoJjcsBIICz7PryfAczLz",
      MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "staging",
      VERCEL_GIT_COMMIT_REF: "fix/preview-migration-target-guard-v2-14",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("intercepted-command:prisma migrate deploy");
    expect(result.stderr).toContain("Refusing migration");
  });

  it("keeps ordinary Preview builds free of migration side effects", () => {
    const result = runBuildGuard("0", {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      MUNSHIOS_DEPLOYMENT_ENVIRONMENT: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("prisma migrate deploy");
    expect(result.stdout).toContain("intercepted-command:next build");
  });

});
