import { fbrEndpoint, type FbrEnvironment, type FbrInvoicePayload } from "@/lib/fbr/digital-invoicing";

export type FbrRemoteResult = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  retryable: boolean;
  errorCode?: string;
  errorMessage?: string;
};

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function extractError(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const validation = record.validationResponse && typeof record.validationResponse === "object"
    ? record.validationResponse as Record<string, unknown>
    : null;
  const invoiceStatuses = validation && Array.isArray(validation.invoiceStatuses)
    ? validation.invoiceStatuses.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
      )
    : [];
  const itemError = invoiceStatuses.find((item) =>
    firstNonEmpty(item.errorCode, item.error, item.status)?.toLowerCase() === "invalid"
    || Boolean(firstNonEmpty(item.errorCode, item.error)),
  );
  const errorCode = firstNonEmpty(validation?.errorCode, itemError?.errorCode, record.errorCode);
  const errorMessage = firstNonEmpty(validation?.error, itemError?.error, record.error);
  return { errorCode, errorMessage };
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function callFbr(input: {
  environment: FbrEnvironment;
  kind: "VALIDATE" | "POST";
  token: string;
  payload: FbrInvoicePayload;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FbrRemoteResult> {
  const token = input.token.trim();
  if (!token) throw new Error("FBR bearer token is not configured.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);

  try {
    const response = await fetchImpl(fbrEndpoint(input.environment, input.kind), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });

    const body = await parseResponseBody(response);
    const { errorCode, errorMessage } = extractError(body);
    return {
      ok: response.ok,
      httpStatus: response.status,
      body,
      retryable: isRetryableHttpStatus(response.status),
      errorCode,
      errorMessage: errorMessage ?? (response.ok ? undefined : `FBR returned HTTP ${response.status}.`),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      httpStatus: 0,
      body: null,
      retryable: true,
      errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
      errorMessage: aborted
        ? "FBR request timed out."
        : error instanceof Error ? error.message : "FBR network request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateInvoiceWithFbr(input: {
  environment: FbrEnvironment;
  token: string;
  payload: FbrInvoicePayload;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  return callFbr({ ...input, kind: "VALIDATE" });
}

export function postInvoiceToFbr(input: {
  environment: FbrEnvironment;
  token: string;
  payload: FbrInvoicePayload;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  return callFbr({ ...input, kind: "POST" });
}
