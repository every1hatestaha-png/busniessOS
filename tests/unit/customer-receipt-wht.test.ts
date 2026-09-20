import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer receipt WHT presentation", () => {
  it("shows gross, WHT, net, WhatsApp, and thermal receipt actions", () => {
    const page = readFileSync("app/(dashboard)/payments/[id]/page.tsx", "utf8");
    expect(page).toContain("Gross balance settled");
    expect(page).toContain("Withholding tax deducted");
    expect(page).toContain("Net cash/bank received");
    expect(page).toContain("buildWhatsAppShareUrl");
    expect(page).toContain('label="80mm receipt" format="thermal"');
  });

  it("keeps WHT account queries sequential inside the interactive transaction", () => {
    const source = readFileSync("lib/server/payments.ts", "utf8");
    expect(source).toContain("const accountsReceivable = await tx.account.findUnique");
    expect(source).toContain("const withholdingTaxReceivable = await tx.account.upsert");
  });
});
