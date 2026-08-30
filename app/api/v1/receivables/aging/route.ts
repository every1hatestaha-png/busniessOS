import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import type { ReceivablesBucket } from "@/lib/server/aging";
import { getReceivablesAging } from "@/lib/server/receivables";

function parseDateQuery(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : undefined;
}

function parseBucket(value: string | null): ReceivablesBucket | "current" | undefined {
  if (value === "current") return "current";
  if (["1-30", "31-45", "46-60", "61+"].includes(value ?? "")) return value as ReceivablesBucket;
  return undefined;
}

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const url = new URL(request.url);
  return apiData(await getReceivablesAging(context.workspaceId, {
    asOf: parseDateQuery(url.searchParams.get("asOf")),
    customerId: url.searchParams.get("customerId")?.trim() || undefined,
    search: url.searchParams.get("search")?.trim() || undefined,
    bucket: parseBucket(url.searchParams.get("bucket")),
    timeZone: context.workspace.timezone ?? undefined,
  }));
});
