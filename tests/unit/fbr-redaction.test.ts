import { describe, expect, it } from "vitest";

import { redactSensitiveFbrData, sanitizeFbrErrorMessage } from "@/lib/fbr/redaction";

describe("FBR evidence redaction", () => {
  it("redacts sensitive keys recursively without changing ordinary FBR evidence", () => {
    expect(redactSensitiveFbrData({
      validationResponse: {
        statusCode: "01",
        token: "secret-token",
        nested: [{ apiKey: "abc", error: "Provide rate." }],
      },
      invoiceNumber: "INV-1",
    })).toEqual({
      validationResponse: {
        statusCode: "01",
        token: "[REDACTED]",
        nested: [{ apiKey: "[REDACTED]", error: "Provide rate." }],
      },
      invoiceNumber: "INV-1",
    });
  });

  it("removes the configured bearer token from persisted error messages", () => {
    expect(sanitizeFbrErrorMessage(
      "Request failed for Bearer super-secret-token",
      "super-secret-token",
    )).toBe("Request failed for Bearer [REDACTED]");
  });

  it("leaves messages unchanged when no token is available", () => {
    expect(sanitizeFbrErrorMessage("FBR request timed out.")).toBe("FBR request timed out.");
  });
});
