export type FbrProvinceReference = { code: number; description: string };
export type FbrTransactionTypeReference = { id: number; description: string };
export type FbrUomReference = { id: number; description: string };
export type FbrRateReference = { id: number; description: string; value: number };

const FBR_REFERENCE_BASE = "https://gw.fbr.gov.pk";

function numberField(record: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = record[name];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringField(record: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = String(record[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function records(body: unknown) {
  return Array.isArray(body)
    ? body.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

export function parseFbrProvinces(body: unknown): FbrProvinceReference[] {
  return records(body).flatMap((record) => {
    const code = numberField(record, ["stateProvinceCode", "stateprovinceCode"]);
    const description = stringField(record, ["stateProvinceDesc", "stateprovinceDesc"]);
    return code !== null && description ? [{ code, description }] : [];
  });
}

export function parseFbrTransactionTypes(body: unknown): FbrTransactionTypeReference[] {
  return records(body).flatMap((record) => {
    const id = numberField(record, ["transactioN_TYPE_ID", "transaction_TYPE_ID", "transactionTypeId"]);
    const description = stringField(record, ["transactioN_DESC", "transaction_DESC", "transactionDesc"]);
    return id !== null && description ? [{ id, description }] : [];
  });
}

export function parseFbrUoms(body: unknown): FbrUomReference[] {
  return records(body).flatMap((record) => {
    const id = numberField(record, ["uoM_ID", "uom_ID", "uomId"]);
    const description = stringField(record, ["description"]);
    return id !== null && description ? [{ id, description }] : [];
  });
}

export function parseFbrRates(body: unknown): FbrRateReference[] {
  return records(body).flatMap((record) => {
    const id = numberField(record, ["ratE_ID", "rate_ID", "rateId"]);
    const description = stringField(record, ["ratE_DESC", "rate_DESC", "rateDesc"]);
    const value = numberField(record, ["ratE_VALUE", "rate_VALUE", "rateValue"]);
    return id !== null && value !== null && description ? [{ id, description, value }] : [];
  });
}

export function plainPercentageRate(description: string, value: number) {
  const match = description.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return false;
  return Math.abs(Number(match[1]) - value) < 0.0001;
}

export function fbrReferenceDate(date: Date, timeZone = "Asia/Karachi") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
}

async function callReference(input: {
  path: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const token = input.token.trim();
  if (!token) throw new Error("FBR sandbox bearer token is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const response = await (input.fetchImpl ?? fetch)(FBR_REFERENCE_BASE + input.path, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text) as unknown; } catch { body = null; }
    }
    if (!response.ok) {
      throw new Error(response.status === 401
        ? "FBR rejected the sandbox credential for reference-data access."
        : `FBR reference API returned HTTP ${response.status}.`);
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("FBR reference API timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFbrProvinces(token: string, fetchImpl?: typeof fetch) {
  return parseFbrProvinces(await callReference({ path: "/pdi/v1/provinces", token, fetchImpl }));
}

export async function fetchFbrTransactionTypes(token: string, fetchImpl?: typeof fetch) {
  return parseFbrTransactionTypes(await callReference({ path: "/pdi/v1/transtypecode", token, fetchImpl }));
}

export async function fetchFbrUoms(token: string, fetchImpl?: typeof fetch) {
  return parseFbrUoms(await callReference({ path: "/pdi/v1/uom", token, fetchImpl }));
}

export async function fetchFbrRates(input: {
  token: string;
  date: string;
  transactionTypeId: number;
  supplierProvinceCode: number;
  fetchImpl?: typeof fetch;
}) {
  const query = new URLSearchParams({
    date: input.date,
    transTypeId: String(input.transactionTypeId),
    originationSupplier: String(input.supplierProvinceCode),
  });
  return parseFbrRates(await callReference({
    path: `/pdi/v2/SaleTypeToRate?${query.toString()}`,
    token: input.token,
    fetchImpl: input.fetchImpl,
  }));
}
