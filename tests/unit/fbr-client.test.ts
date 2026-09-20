import { describe, expect, it, vi } from "vitest";
import { postInvoiceToFbr, validateInvoiceWithFbr } from "@/lib/fbr/client";
import type { FbrInvoicePayload } from "@/lib/fbr/digital-invoicing";

const payload: FbrInvoicePayload = {
  invoiceType: "Sale Invoice",
  invoiceDate: "2026-09-19",
  sellerNTNCNIC: "1234567",
  sellerBusinessName: "Seller",
  sellerProvince: "PUNJAB",
  sellerAddress: "Lahore",
  buyerNTNCNIC: "1234567890123",
  buyerBusinessName: "Buyer",
  buyerProvince: "PUNJAB",
  buyerAddress: "Lahore",
  buyerRegistrationType: "Registered",
  scenarioId: "SN001",
  items: [{
    hsCode: "0101.2100",
    productDescription: "Item",
    rate: "18%",
    uoM: "Numbers, pieces, units",
    quantity: 1,
    totalValues: 118,
    valueSalesExcludingST: 100,
    fixedNotifiedValueOrRetailPrice: 0,
    salesTaxApplicable: 18,
    salesTaxWithheldAtSource: 0,
    saleType: "Goods at standard rate (default)",
  }],
};

describe("FBR API client", () => {
  it("sends bearer auth to the explicit v1.12 sandbox validate URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-token");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      return new Response(JSON.stringify({ validationResponse: { statusCode: "00", status: "Valid", error: "" } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await validateInvoiceWithFbr({ environment: "SANDBOX", token: "secret-token", payload, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.retryable).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies 401 as non-retryable", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })) as unknown as typeof fetch;
    const result = await validateInvoiceWithFbr({ environment: "PRODUCTION", token: "bad-token", payload, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.httpStatus).toBe(401);
  });

  it("classifies server errors as retryable", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Temporary failure" }), { status: 500 })) as unknown as typeof fetch;
    const result = await postInvoiceToFbr({ environment: "PRODUCTION", token: "token", payload, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("extracts FBR validation error details", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      validationResponse: { statusCode: "01", status: "Invalid", errorCode: "0046", error: "Provide rate." },
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await validateInvoiceWithFbr({ environment: "SANDBOX", token: "token", payload, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.errorCode).toBe("0046");
    expect(result.errorMessage).toBe("Provide rate.");
  });


  it("extracts item-level FBR validation errors when the header error is empty", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      validationResponse: {
        statusCode: "00",
        status: "Invalid",
        errorCode: null,
        error: "",
        invoiceStatuses: [
          { itemSNo: "1", statusCode: "01", status: "Invalid", errorCode: "0046", error: "Provide rate." },
        ],
      },
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await validateInvoiceWithFbr({ environment: "SANDBOX", token: "token", payload, fetchImpl });
    expect(result.errorCode).toBe("0046");
    expect(result.errorMessage).toBe("Provide rate.");
  });

  it("fails before network access when the token is blank", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(validateInvoiceWithFbr({ environment: "SANDBOX", token: "  ", payload, fetchImpl })).rejects.toThrow("FBR bearer token is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies request timeouts as retryable without exposing the bearer token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
      throw new Error("unreachable");
    }) as unknown as typeof fetch;

    const result = await postInvoiceToFbr({
      environment: "SANDBOX",
      token: "super-secret-token",
      payload,
      fetchImpl,
      timeoutMs: 1,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      httpStatus: 0,
      retryable: true,
      errorCode: "TIMEOUT",
      errorMessage: "FBR request timed out.",
    }));
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("classifies network failures as retryable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection reset");
    }) as unknown as typeof fetch;
    const result = await validateInvoiceWithFbr({
      environment: "SANDBOX",
      token: "token",
      payload,
      fetchImpl,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      httpStatus: 0,
      retryable: true,
      errorCode: "NETWORK_ERROR",
      errorMessage: "connection reset",
    }));
  });

});
