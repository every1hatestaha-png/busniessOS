import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import production from "@/config/database-targets.json";
import staging from "@/config/staging-database-targets.json";
import { checkDatabaseReadiness, findPendingMigrations } from "@/lib/server/database-readiness";

const { query, readdir } = vi.hoisted(() => ({ query: vi.fn(), readdir: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: query } }));
vi.mock("node:fs/promises", () => ({ readdir }));

describe("database migration readiness", () => {
  it("detects shipped migrations missing from the runtime database", () => {
    expect(findPendingMigrations(["001_init", "002_fbr", "003_tax"], ["001_init", "003_tax"])).toEqual(["002_fbr"]);
  });

  it("reports no pending migrations when runtime schema matches the artifact", () => {
    expect(findPendingMigrations(["001_init", "002_fbr"], ["002_fbr", "001_init"])).toEqual([]);
  });
});

describe("runtime readiness target selection", () => {
  beforeEach(() => {
    query.mockReset();
    readdir.mockReset();
    query.mockResolvedValue([{ migration_name: "001_init" }]);
    readdir.mockResolvedValue([{ name: "001_init", isDirectory: () => true }]);
    vi.stubEnv("MUNSHIOS_DEPLOYMENT_ENVIRONMENT", undefined);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_PROJECT_ID", staging.vercelProjectId);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(production.productionHosts)("keeps strict production readiness as the default", async (host) => {
    vi.stubEnv("DATABASE_URL", `postgresql://synthetic:synthetic@${host}/neondb`);
    await expect(checkDatabaseReadiness()).resolves.toEqual({ ready: true, pendingCount: 0 });
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects the staging database without an explicit allowance before querying it", async () => {
    vi.stubEnv("DATABASE_URL", `postgresql://synthetic:synthetic@${staging.hosts[0]}/neondb`);
    await expect(checkDatabaseReadiness()).rejects.toThrow("Production database target rejected");
    expect(query).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("checks the real migration ledger after accepting the explicitly scoped staging target", async () => {
    vi.stubEnv("MUNSHIOS_DEPLOYMENT_ENVIRONMENT", "staging");
    vi.stubEnv("DATABASE_URL", `postgresql://synthetic:synthetic@${staging.hosts[0]}/neondb`);
    readdir.mockResolvedValue([
      { name: "001_init", isDirectory: () => true },
      { name: "002_restaurant", isDirectory: () => true },
      { name: "migration_lock.toml", isDirectory: () => false },
    ]);
    await expect(checkDatabaseReadiness()).resolves.toEqual({ ready: false, pendingCount: 1 });
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed when staging database connectivity fails", async () => {
    vi.stubEnv("MUNSHIOS_DEPLOYMENT_ENVIRONMENT", "staging");
    vi.stubEnv("DATABASE_URL", `postgresql://synthetic:synthetic@${staging.hosts[0]}/neondb`);
    query.mockRejectedValue(new Error("Synthetic connectivity failure"));
    await expect(checkDatabaseReadiness()).rejects.toThrow("Synthetic connectivity failure");
  });

  it.each([production.productionHosts[0], "unknown.example", staging.hosts[0]])(
    "rejects invalid staging context or target before database access",
    async (host) => {
      vi.stubEnv("MUNSHIOS_DEPLOYMENT_ENVIRONMENT", "staging");
      vi.stubEnv("DATABASE_URL", `postgresql://synthetic:synthetic@${host}/neondb`);
      if (host === staging.hosts[0]) vi.stubEnv("VERCEL_PROJECT_ID", "prj_different_project");
      await expect(checkDatabaseReadiness()).rejects.toThrow("Staging database target rejected");
      expect(query).not.toHaveBeenCalled();
    },
  );
});
