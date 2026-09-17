import { describe, expect, it } from "vitest";

import {
  applyActivePromise,
  buildCollectionMessage,
  buildSmartCollectionRows,
  buildWhatsAppUrl,
  buildWhatsAppUrlForMessage,
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
    expect(rows[0]).toMatchObject({ status: "CRITICAL", priority: "URGENT", daysPastTerms: 35, needsContact: true });
    expect(rows[1]).toMatchObject({ status: "OVERDUE", priority: "HIGH", daysPastTerms: 5, needsContact: true });
    expect(rows[2]).toMatchObject({ status: "CURRENT", priority: "NONE", needsContact: false });
  });

  it("supports multiple customer numbers and keeps the first as primary", () => {
    const [row] = buildSmartCollectionRows([
      { customerId: "multi", customerName: "Multi Contact Co", phone: "03001234567\n03217654321\n+44 7700 900123", creditDays: 30, currentBalance: 15_000, oldestAgeDays: 31, items: [{ documentNumber: "INV-0010", outstandingAmount: 15_000, ageDays: 31 }] },
    ]);

    expect(row.phoneNumbers).toEqual(["03001234567", "03217654321", "+44 7700 900123"]);
    expect(row.whatsappPhones.map((phone) => phone.normalized)).toEqual(["923001234567", "923217654321", "447700900123"]);
    expect(row.whatsappPhones[0].isPrimary).toBe(true);
    expect(row.whatsappPhone).toBe("923001234567");

    const secondNumberUrl = buildWhatsAppUrl(row, "Arshad Sons", "roman-urdu", "03217654321");
    expect(secondNumberUrl).toMatch(/^https:\/\/wa\.me\/923217654321\?text=/);
  });

  it("snoozes future promises and escalates due or missed promises", () => {
    const [base] = buildSmartCollectionRows([
      { customerId: "c1", customerName: "Pak Star", phone: "03001234567", creditDays: 10, currentBalance: 450_387, oldestAgeDays: 18, items: [{ documentNumber: "INV-0042", outstandingAmount: 450_387, ageDays: 18 }] },
    ]);

    const upcoming = applyActivePromise(base, { id: "p1", amount: 200_000, promiseDate: "2026-09-20", timing: "UPCOMING", daysLate: 0, note: "Bank transfer" });
    expect(upcoming).toMatchObject({ needsContact: false, activePromise: { timing: "UPCOMING" } });

    const dueToday = applyActivePromise(base, { id: "p1", amount: 200_000, promiseDate: "2026-09-17", timing: "TODAY", daysLate: 0, note: "" });
    expect(dueToday).toMatchObject({ needsContact: true, priority: "HIGH" });
    expect(buildCollectionMessage(dueToday, "Arshad Sons", "roman-urdu")).toContain("PAYMENT PROMISE DUE TODAY");

    const missed = applyActivePromise(base, { id: "p1", amount: 200_000, promiseDate: "2026-09-15", timing: "MISSED", daysLate: 2, note: "" });
    expect(missed).toMatchObject({ needsContact: true, priority: "URGENT" });
    const message = buildCollectionMessage(missed, "Arshad Sons", "english");
    expect(message).toContain("Promised payment of Rs 200,000");
    expect(message).toContain("2 days late");
  });

  it("does not invent due dates or overdue days for opening balances", () => {
    const [row] = buildSmartCollectionRows([
      { customerId: "opening", customerName: "Opening Co", phone: "03001234567", creditDays: 60, currentBalance: 5_378_159, oldestAgeDays: 0, items: [{ documentNumber: "OPENING BALANCE", outstandingAmount: 5_378_159, ageDays: 0, isOpeningBalance: true }] },
    ]);

    expect(row).toMatchObject({ status: "REVIEW", priority: "REVIEW", oldestAgeDays: null, daysPastTerms: null, needsContact: false });
    const message = buildCollectionMessage(row, "Arshad Sons", "roman-urdu");
    expect(message).toContain("Rs 5,378,159");
    expect(message).toContain("ACCOUNT BALANCE CONFIRMATION");
    expect(message).not.toContain("overdue");
    expect(message).not.toContain("due hai");
  });

  it("uses authoritative balance and professional status-aware reminder formatting", () => {
    const [row] = buildSmartCollectionRows([
      { customerId: "c1", customerName: "Pak Star", phone: "03001234567", creditDays: 10, currentBalance: 450_387, oldestAgeDays: 18, items: [{ documentNumber: "INV-0042", outstandingAmount: 500_000, ageDays: 18 }] },
    ]);

    const message = buildCollectionMessage(row, "Arshad Sons", "roman-urdu");
    expect(message).toContain("*PAYMENT FOLLOW-UP*");
    expect(message).toContain("*Outstanding:* Rs 450,387");
    expect(message).toContain("*Status:* 8 din payment terms se late");
    expect(message).toContain("*Reference(s):* INV-0042");
    expect(message).toContain("*Accounts — Arshad Sons*");
    expect(message).not.toContain("500,000");

    const url = buildWhatsAppUrl(row, "Arshad Sons", "english");
    expect(url).toMatch(/^https:\/\/wa\.me\/923001234567\?text=/);
    const decoded = decodeURIComponent(url!.split("text=")[1]);
    expect(decoded).toContain("*Outstanding:* Rs 450,387");
    expect(decoded).toContain("8 days past payment terms");

    const editedUrl = buildWhatsAppUrlForMessage("03001234567", "Custom approved reminder");
    expect(decodeURIComponent(editedUrl!.split("text=")[1])).toBe("Custom approved reminder");
  });

  it("summarizes only customers that currently need contact", () => {
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

    // Rows are priority-sorted, so rows[0] is the critical Rs 200 customer.
    // Snoozing that customer leaves only the Rs 100 due account in today's queue.
    const snoozed = applyActivePromise(rows[0], { id: "p2", amount: 100, promiseDate: "2026-09-30", timing: "UPCOMING", daysLate: 0, note: "" });
    expect(summarizeSmartCollections([snoozed, rows[1], rows[2]])).toMatchObject({ dueNow: 100, contactCount: 1, criticalCount: 0 });
  });
});
