import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { financeGradeHarnessNormalizer } from "../finance-grade/harness-normalizer";

describe("finance harness platform invariance", () => {
  it("applies the same opening-balance oracle corrections with LF and CRLF", () => {
    const id = `${process.cwd()}/tests/finance-grade/oracle/accounting-oracle.ts`;
    const lf = readFileSync(id, "utf8").replaceAll("\r\n", "\n");
    const transform = financeGradeHarnessNormalizer().transform;
    const unix = transform(lf, id)!.code;
    const windows = transform(lf.replaceAll("\n", "\r\n"), id)!.code;
    expect(windows).toBe(unix);
    expect(windows).toContain("this.openingProductStock.set(p.id, p.stockQuantity)");
    expect(windows).toContain("this.openingSupplierBalance.set(s.id, s.currentBalance)");
    expect(windows).toContain("this.openingCustomerBalance.set(c.id, c.currentBalance)");
  });
});
