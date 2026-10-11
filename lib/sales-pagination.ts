import { z } from "zod";

const status = z.enum(["DRAFT", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]);
const cursorSchema = z.object({
  v: z.literal(1), w: z.string().uuid(), i: z.string().uuid(),
  d: z.iso.datetime(), q: z.string().max(120), s: status.optional(),
}).strict();

export class SalesCursorError extends Error {}

export function salesPageOptions(params: URLSearchParams) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(100),
    query: z.string().trim().max(120), status: status.optional(),
    cursor: z.string().min(1).max(1024).optional(),
  }).parse({
    limit: params.get("limit") ?? 50, query: params.get("q") ?? "",
    status: params.get("status") || undefined, cursor: params.get("cursor") ?? undefined,
  });
}
export type SalesPageOptions = ReturnType<typeof salesPageOptions>;

export function decodeSalesCursor(cursor: string, workspaceId: string, options: SalesPageOptions) {
  try {
    const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (Buffer.from(JSON.stringify(decoded)).toString("base64url") !== cursor
      || decoded.w !== workspaceId || decoded.q !== options.query || decoded.s !== options.status) {
      throw new Error("Cursor context changed");
    }
    return decoded;
  } catch {
    throw new SalesCursorError("Invalid sales cursor. Restart from the first page.");
  }
}
export function encodeSalesCursor(workspaceId: string, row: { id: string; orderDate: Date }, options: SalesPageOptions) {
  return Buffer.from(JSON.stringify({ v: 1, w: workspaceId, i: row.id, d: row.orderDate.toISOString(), q: options.query, ...(options.status ? { s: options.status } : {}) })).toString("base64url");
}
