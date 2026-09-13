import { describe, expect, it } from "vitest";

import { sortStatementRowsByBusinessDay } from "@/lib/statement-order";

describe("sortStatementRowsByBusinessDay", () => {
  it("uses creation chronology for entries posted on the same Karachi business day", () => {
    const rows = [
      {
        id: "payment",
        date: new Date("2026-09-11T00:00:00.000Z"),
        createdAt: new Date("2026-09-11T18:21:00.000Z"),
      },
      {
        id: "sale",
        date: new Date("2026-09-11T18:20:23.552Z"),
        createdAt: new Date("2026-09-11T18:20:23.552Z"),
      },
    ];

    expect(sortStatementRowsByBusinessDay(rows).map((row) => row.id)).toEqual(["sale", "payment"]);
  });

  it("keeps different Karachi business dates in accounting-date order", () => {
    const rows = [
      {
        id: "later-business-date",
        date: new Date("2026-09-12T00:00:00.000+05:00"),
        createdAt: new Date("2026-09-10T00:00:00.000Z"),
      },
      {
        id: "earlier-business-date",
        date: new Date("2026-09-11T23:00:00.000+05:00"),
        createdAt: new Date("2026-09-13T00:00:00.000Z"),
      },
    ];

    expect(sortStatementRowsByBusinessDay(rows).map((row) => row.id)).toEqual([
      "earlier-business-date",
      "later-business-date",
    ]);
  });

  it("uses id as a deterministic tie-break when date and creation time match", () => {
    const timestamp = new Date("2026-09-11T12:00:00.000Z");
    const rows = [
      { id: "b", date: timestamp, createdAt: timestamp },
      { id: "a", date: timestamp, createdAt: timestamp },
    ];

    expect(sortStatementRowsByBusinessDay(rows).map((row) => row.id)).toEqual(["a", "b"]);
  });
});
