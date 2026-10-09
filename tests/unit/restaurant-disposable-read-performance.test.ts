import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("disposable read performance runner target boundary", () => {
  it.each(["", "postgresql://fixture@production.invalid/munshios_restaurant_perf", "postgresql://fixture@127.0.0.1/original_data", "https://127.0.0.1/munshios_restaurant_perf"])("rejects %s before connecting or running benchmarks", url => {
    const result = spawnSync(process.execPath, [resolve("scripts/restaurant-read-performance-disposable.cjs")], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: url, STAGING_READ_WORKSPACE: "forged" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Read performance requires the dedicated disposable loopback database.");
    expect(result.stdout).not.toContain("RUN  v");
  });
});
