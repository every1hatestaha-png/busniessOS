import { describe, expect, it } from "vitest";

import {
  buildCollectionMessage,
  buildSmartCollectionRows,
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
  summarizeSmartCollections,
} from "@/lib/smart-collections";

describe("Smart Collections", () => {
  it("normalizes common Pakistan WhatsApp numbers without changing international numbers", () => {
    expect(normalizeWhatsAppPhone("0300-1234567")).toBe("923001234567");
    expect(normalizeWhatsAppPhone("+92 300 1234567")).toBe("923001234567");
    expect(normalizeWhatsAppPhone("0092 300 1234567")).toBe("923001234567");
    expect(normalizeWhatsAppPhone("+44 7700 900123")).toBe("447700900123");
    expect(normalizeWhatsAppPhone("123")).toBeNull();
  });

  it("prioritizes critical and overdue balances before current balances", () => {
    const rows = buildSmartCollectionRows([
      { customerId: "current", customerName: "Current Co", phone: "03001234567", creditDays: 30, currentBalance: 10_000, oldestAgeDays: 5, items: [] },
      { customerId: "critical", customerName: "Critical Co", phone: "03001234568", creditDays: 30, currentBalance: 40_000, oldestAgeDays: 65, items: [{ documentNumber: "INV-0009", outstandingAmount: 40_000, ageDays: 65 }] },
      { customerId: "overdue", customerName: "Overdue Co", phone: "03001234569", creditDays: 15, currentBalance: 20_000, oldestAgeDays: 20, items: [{ documentNumber: "INV-0008", outstandingAmount: 20_000, ageDays: 20 }] },
    ]);

    expect(rows.map((row) => row.customerId)).toEqual(["critical", "overdue", "current"]);
    expect(rows[0]).toMatchObject({ status: "CRITICAL", daysPastTerms: 35, needsContact: true });
    expect(rows[1]).toMatchObject({ status: "OVERDUE", daysPastTerms: 5, needsContact: true });
    expect(rows[2]).toMatchObject({ status: "CURRENT", needsContact: false });
  });

  it("uses the authoritative account balance in the reminder and preserves human invoice references", () => {
    const [row] = buildSmartCollectionRows([
      { customerId: "c1", customerName: "Pak Star", phone: "03001234567", creditDays: 10, currentBalance: 450_387, oldestAgeDays: 18, items: [{ documentNumber: "INV-0042", outstandingAmount: 500_000, ageDays: 18 }] },
    ]);

    const message = buildCollectionMessage(row, "Arshad Sons", "roman-urdu");
    expect(message).toContain("Rs 450,387");
    expect(message).toContain("8 din overdue");
    expect(message).toContain("INV-0042");
    expect(message).toContain("Arshad Sons");
    expect(message).not.toContain("500,000");

    const url = buildWhatsAppUrl(row, "Arshad Sons", "english");
    expect(url).toMatch(/^https:\/\/wa\.me\/923001234567\?text=/);
    expect(decodeURIComponent(url!.split("text=")[1])).toContain("outstanding balance of Rs 450,387");
  });

  it("summarizes only due customers as collection work", () => {
    const rows = buildSmartCollectionRows([
      { customerId: "due", customerName: "Due Co", phone: "", creditDays: 0, currentBalance: 100, oldestAgeDays: 0, items: [] },
      { customerId: "critical", customerName: "Critical Co", phone: "03001234567", creditDays: 10, currentBalance: 200, oldestAgeDays: 45, items: [] },
      { customerId: "current", customerName: "Current Co", phone: "03001234568", creditDays: 30, currentBalance: 300, oldestAgeDays: 5, items: [] },
      { customerId: "credit", customerName: "Credit Co", phone: "03001234569", creditDays: 30, currentBalance: -50, oldestAgeDays: null, items: [] },
    ]);

    expect(summarizeSmartCollections(rows)).toEqual({
      totalOpen: 600,
      dueNow: 300,
      criticalAmount: 200,
      contactCount: 2,
      criticalCount: 1,
      missingPhoneCount: 1,
    });
  });
});
