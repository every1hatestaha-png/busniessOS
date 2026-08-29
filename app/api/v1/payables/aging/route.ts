import { apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getPayablesAging } from "@/lib/server/payables";
import type { PayablesBucket } from "@/lib/server/aging";

function parseDateQuery(value: string | null): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function parseBucket(value: string | null): PayablesBucket | "current" | undefined {
  if (!value) return undefined;
  if (value === "current") return "current";
  if (["1-30", "31-45", "46-60", "61+"].includes(value)) return value as PayablesBucket;
  return undefined;
}

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const url = new URL(request.url);
  const report = await getPayablesAging(context.workspaceId, {
    asOf: parseDateQuery(url.searchParams.get("asOf")),
    supplierId: url.searchParams.get("supplierId")?.trim() || undefined,
    search: url.searchParams.get("search")?.trim() || undefined,
    bucket: parseBucket(url.searchParams.get("bucket")),
    timeZone: context.workspace.timezone ?? undefined,
  });
  return apiData(report);
});
