import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Keep database-backed readiness dependencies request-scoped so Vercel preview
    // builds without DATABASE_URL can compile. The public readiness surface must
    // stay minimal and must not disclose deployment revision or security posture.
    const { checkDatabaseReadiness } = await import("@/lib/server/database-readiness");
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
