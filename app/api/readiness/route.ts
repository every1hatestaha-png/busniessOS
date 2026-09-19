import { NextResponse } from "next/server";

import { checkDatabaseReadiness } from "@/lib/server/database-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const readiness = await checkDatabaseReadiness();
    if (!readiness.ready) {
      return NextResponse.json(
        { ok: false, database: "schema_pending" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, database: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
