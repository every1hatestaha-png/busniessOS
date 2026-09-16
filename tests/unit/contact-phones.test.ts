import { describe, expect, it } from "vitest";

import { serializeContactPhones, splitContactPhones } from "@/lib/contact-phones";
import { customerSchema } from "@/lib/validation/customer";

const validCustomer = {
  name: "Ahmed Ali",
  companyName: "Ahmed Autos",
  phone: "03001234567",
  email: "accounts@ahmedautos.pk",
  city: "Lahore",
  address: "Main Market Lahore",
  creditDays: 30,
  creditLimit: "0",
  openingBalance: "0",
  status: "ACTIVE" as const,
  notes: "",
};

describe("customer contact phones", () => {
  it("splits newline, comma, semicolon, and pipe separated phone numbers", () => {
    expect(splitContactPhones("03001234567\n03217654321, +44 7700 900123; 03331234567 | 03451234567")).toEqual([
      "03001234567",
      "03217654321",
      "+44 7700 900123",
      "03331234567",
      "03451234567",
    ]);
  });

  it("deduplicates and serializes contacts one per line", () => {
    expect(serializeContactPhones(["03001234567", "03217654321", "03001234567"])).toBe("03001234567\n03217654321");
  });

  it("accepts up to six valid customer phone numbers", () => {
    const parsed = customerSchema.safeParse({
      ...validCustomer,
      phone: ["03001234567", "03111234567", "03221234567", "03331234567", "03441234567", "03551234567"].join("\n"),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects more than six phone numbers and malformed numbers", () => {
    const tooMany = customerSchema.safeParse({
      ...validCustomer,
      phone: ["03001234567", "03111234567", "03221234567", "03331234567", "03441234567", "03551234567", "03661234567"].join("\n"),
    });
    expect(tooMany.success).toBe(false);

    const malformed = customerSchema.safeParse({ ...validCustomer, phone: "03001234567\n123" });
    expect(malformed.success).toBe(false);
  });
});
