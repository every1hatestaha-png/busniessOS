import { describe, expect, it } from "vitest";
import { decodeSalesCursor, encodeSalesCursor, salesPageOptions } from "@/lib/sales-pagination";
const workspace = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const row = { id: "33333333-3333-4333-8333-333333333333", orderDate: new Date("2026-10-01T12:00:00.000Z") };
describe("sales cursor contract", () => {
  it("defaults to 50 with a maximum of 100", () => {
    expect(salesPageOptions(new URLSearchParams()).limit).toBe(50);
    expect(salesPageOptions(new URLSearchParams("limit=100")).limit).toBe(100);
  });
  it.each(["0", "101", "-1", "1.5", "Infinity", "no"])("rejects invalid limit %s", limit => {
    expect(() => salesPageOptions(new URLSearchParams({ limit }))).toThrow();
  });
  it("round trips a tied-date cursor and binds tenant and search filters", () => {
    const options = salesPageOptions(new URLSearchParams("q=invoice&status=COMPLETED"));
    const cursor = encodeSalesCursor(workspace, row, options);
    expect(decodeSalesCursor(cursor, workspace, options)).toMatchObject({ i: row.id, d: row.orderDate.toISOString() });
    expect(() => decodeSalesCursor(cursor, foreign, options)).toThrow();
    expect(() => decodeSalesCursor(cursor, workspace, { ...options, query: "other" })).toThrow();
    expect(() => decodeSalesCursor(cursor, workspace, { ...options, status: "DRAFT" })).toThrow();
  });
  it.each(["broken", "e30", ""])("rejects malformed cursor %s", cursor => {
    expect(() => decodeSalesCursor(cursor, workspace, salesPageOptions(new URLSearchParams()))).toThrow();
  });
});
