import { describe, expect, it } from "vitest";

import { interpretFbrPostResult } from "@/lib/server/fbr-remote-submission";

describe("FBR post result interpretation", () => {
  it("requires both a valid FBR response and invoice number", () => {
    expect(interpretFbrPostResult({
      ok: true,
      httpStatus: 200,
      retryable: false,
      body: { invoiceNumber: "12345", validationResponse: { statusCode: "00", status: "Valid" } },
    })).toEqual({ state: "SUBMITTED", invoiceNumber: "12345" });

    expect(interpretFbrPostResult({
      ok: true,
      httpStatus: 200,
      retryable: false,
      body: { validationResponse: { statusCode: "00", status: "Valid" } },
    }).state).toBe("FAILED");
  });

  it("blocks unauthorized credentials", () => {
    expect(interpretFbrPostResult({
      ok: false,
      httpStatus: 401,
      retryable: false,
      body: { error: "Unauthorized" },
      errorMessage: "Unauthorized",
    })).toEqual({ state: "BLOCKED", code: "UNAUTHORIZED", message: "Unauthorized" });
  });

  it("blocks blind retries after network ambiguity", () => {
    const result = interpretFbrPostResult({
      ok: false,
      httpStatus: 0,
      retryable: true,
      body: null,
      errorCode: "TIMEOUT",
      errorMessage: "FBR request timed out.",
    });
    expect(result.state).toBe("BLOCKED");
    expect(result).toEqual(expect.objectContaining({ code: "AMBIGUOUS_POST_RESULT" }));
  });

  it("blocks blind retries after server-side failures", () => {
    const result = interpretFbrPostResult({
      ok: false,
      httpStatus: 500,
      retryable: true,
      body: { error: "Internal failure" },
    });
    expect(result).toEqual(expect.objectContaining({ state: "BLOCKED", code: "AMBIGUOUS_POST_RESULT" }));
  });

  it("keeps explicit validation rejection retryable only after correction", () => {
    const result = interpretFbrPostResult({
      ok: true,
      httpStatus: 200,
      retryable: false,
      body: { validationResponse: { statusCode: "01", status: "Invalid", errorCode: "0046", error: "Provide rate." } },
      errorCode: "0046",
      errorMessage: "Provide rate.",
    });
    expect(result).toEqual({ state: "FAILED", code: "0046", message: "Provide rate." });
  });
});
