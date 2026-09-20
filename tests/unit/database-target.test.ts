import { describe, expect, it } from "vitest";

import { assertApprovedProductionDatabaseTarget, classifyDatabaseTarget } from "@/lib/database-target";

const productionDirect = "ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech";
const productionPooled = "ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech";
const developmentDirect = "ep-icy-recipe-b3fwtekt.c-4.ap-southeast-1.aws.neon.tech";

describe("database target policy", () => {
  it.each([productionDirect, productionPooled])("approves a known production endpoint variant", (host) => {
    expect(classifyDatabaseTarget(`postgresql://role:secret@${host}/neondb?sslmode=require`)).toEqual({
      classification: "production",
      approved: true,
    });
  });

  it("classifies the historical development endpoint but rejects it", () => {
    expect(classifyDatabaseTarget(`postgresql://role:secret@${developmentDirect}/neondb`)).toEqual({
      classification: "development",
      approved: false,
    });
  });

  it.each([
    undefined,
    "not-a-url",
    "https://ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech/neondb",
    `postgresql://role:secret@${productionDirect}/wrong_database`,
    "postgresql://role:secret@unknown.example/neondb",
  ])("fails closed for missing, malformed, unknown, or wrong-database targets", (value) => {
    expect(classifyDatabaseTarget(value).approved).toBe(false);
    expect(() => assertApprovedProductionDatabaseTarget(value)).toThrow("Production database target rejected");
  });
});
