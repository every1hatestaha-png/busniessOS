import { describe, expect, it } from "vitest";

import { findPendingMigrations } from "@/lib/server/database-readiness";

describe("database migration readiness", () => {
  it("detects shipped migrations missing from the runtime database", () => {
    expect(findPendingMigrations(["001_init", "002_fbr", "003_tax"], ["001_init", "003_tax"])).toEqual(["002_fbr"]);
  });

  it("reports no pending migrations when runtime schema matches the artifact", () => {
    expect(findPendingMigrations(["001_init", "002_fbr"], ["002_fbr", "001_init"])).toEqual([]);
  });
});
