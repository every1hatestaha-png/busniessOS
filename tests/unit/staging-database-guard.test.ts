import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrationChecksumMatches } = require("../../scripts/assert-staging-database-target.cjs");

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
