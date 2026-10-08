import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrationChecksumMatches, assertStagingMigrationHistory, assertRecoverySchemaState } = require("../../scripts/assert-staging-database-target.cjs");

describe("staging migration checksum guard", () => {
  it("accepts exact bytes", () => {
    const bytes = Buffer.from("SELECT 1;\n", "utf8");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(migrationChecksumMatches(bytes, checksum)).toBe(true);
  });

  it("accepts only LF/CRLF-equivalent migration bytes", () => {
    const lf = Buffer.from("SELECT 1;\nSELECT 2;\n", "utf8");
    const crlf = Buffer.from("SELECT 1;\r\nSELECT 2;\r\n", "utf8");
    const crlfChecksum = createHash("sha256").update(crlf).digest("hex");
    expect(migrationChecksumMatches(lf, crlfChecksum)).toBe(true);
  });

  it("rejects a semantic or whitespace change beyond line endings", () => {
    const current = Buffer.from("SELECT 1;\n", "utf8");
    const different = Buffer.from("SELECT 2;\n", "utf8");
    const differentChecksum = createHash("sha256").update(different).digest("hex");
    expect(migrationChecksumMatches(current, differentChecksum)).toBe(false);
  });
});

describe("staging release migration tail", () => {
  const root = path.resolve("prisma/migrations");
  const expected = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, "migration.sql"))).sort();
  const applied = (count: number) => expected.slice(0, count).map(migration_name => ({ migration_name, finished_at: new Date(), rolled_back_at: null }));

  it.each([130, 131, 132])("accepts the current 132-file catalog with %i applied", count => {
    expect(expected).toHaveLength(132);
    expect(assertStagingMigrationHistory(expected, applied(count)).pending).toEqual(expected.slice(count));
  });

  it("preserves the previous 131-file release catalog", () => {
    expect(assertStagingMigrationHistory(expected.slice(0, 131), applied(130)).pending).toEqual([expected[130]]);
    expect(assertStagingMigrationHistory(expected.slice(0, 131), applied(131)).pending).toEqual([]);
  });

  it("allows a rolled-back known attempt followed by one completed retry", () => {
    const retry = { migration_name: expected[130], finished_at: null, rolled_back_at: new Date() };
    expect(() => assertStagingMigrationHistory(expected, [...applied(131), retry])).not.toThrow();
  });

  it.each([
    ["missing baseline", () => applied(129)],
    ["hole in baseline", () => applied(131).filter((_, index) => index !== 4)],
    ["duplicate successful entry", () => [...applied(131), applied(131)[130]]],
    ["unfinished migration", () => [...applied(130), { migration_name: expected[130], finished_at: null, rolled_back_at: null }]],
    ["unknown migration", () => [...applied(130), { migration_name: "unknown", finished_at: new Date(), rolled_back_at: null }]],
    ["recovery before station", () => [...applied(130), applied(132)[131]]],
  ] as const)("rejects %s", (_, rows) => {
    expect(() => assertStagingMigrationHistory(expected, rows())).toThrow("requires investigation");
  });

  it("rejects an unreviewed catalog or reordered release tail", () => {
    expect(() => assertStagingMigrationHistory([...expected, "future_migration"], applied(130))).toThrow();
    expect(() => assertStagingMigrationHistory([...expected.slice(0, 130), expected[131], expected[130]], applied(130))).toThrow();
    expect(() => assertStagingMigrationHistory(expected.slice(0, 130), applied(130))).toThrow();
  });
});

describe("recovery schema and migration ledger", () => {
  const absent = { table_present: false, columns_valid: false, constraints_valid: false, bucket_index_valid: false, sales_index_valid: false };
  const present = Object.fromEntries(Object.keys(absent).map(key => [key, true]));

  it("accepts only wholly absent pending DDL or complete applied DDL", () => {
    expect(() => assertRecoverySchemaState(true, absent)).not.toThrow();
    expect(() => assertRecoverySchemaState(false, present)).not.toThrow();
    expect(() => assertRecoverySchemaState(true, present)).toThrow();
    expect(() => assertRecoverySchemaState(false, absent)).toThrow();
  });

  it.each(Object.keys(absent))("rejects partial DDL or a missing applied %s", key => {
    expect(() => assertRecoverySchemaState(true, { ...absent, [key]: true })).toThrow();
    expect(() => assertRecoverySchemaState(false, { ...present, [key]: false })).toThrow();
    const unknown = { ...present };
    delete unknown[key];
    expect(() => assertRecoverySchemaState(false, unknown)).toThrow();
  });
});
