import { describe, expect, it } from "vitest";

import { csvEscape, rowsToCsv } from "@/lib/csv";

describe("CSV export", () => {
  it("escapes commas, quotes, and line breaks", () => {
    expect(csvEscape("Ali Autos, Lahore")).toBe('"Ali Autos, Lahore"');
    expect(csvEscape('He said "paid"')).toBe('"He said ""paid"""');
    expect(csvEscape("line 1\nline 2")).toBe("line 1 line 2");
  });

  it("serializes report rows with CRLF separators", () => {
    expect(rowsToCsv([["Document", "Amount"], ["INV-1", "Rs 1,000"]]))
      .toBe('Document,Amount\r\nINV-1,"Rs 1,000"');
  });
});
