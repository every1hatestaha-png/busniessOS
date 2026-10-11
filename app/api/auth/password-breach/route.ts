import { NextResponse } from "next/server";

import { isAcceptableNewPassword } from "@/lib/auth-password-policy";
import { isSameOriginWebMutation } from "@/lib/server/cors";
import { checkPasswordAgainstBreaches } from "@/lib/server/password-breach-check";

const privateHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOriginWebMutation(request)) {
    return NextResponse.json({ safe: false, code: "forbidden" }, { status: 403, headers: privateHeaders });
  }
  try {
    // Bound request input before parsing or making any external request.
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ safe: false, code: "invalid" }, { status: 422, headers: privateHeaders });
    const body = JSON.parse(raw) as { password?: unknown };
    if (typeof body.password !== "string" || !isAcceptableNewPassword(body.password)) {
      return NextResponse.json({ safe: false, code: "invalid" }, { status: 422, headers: privateHeaders });
    }
    const result = await checkPasswordAgainstBreaches(body.password);
    if (result === "compromised") {
      return NextResponse.json({ safe: false, code: "compromised" }, { status: 422, headers: privateHeaders });
    }
    if (result === "unavailable") {
      return NextResponse.json({ safe: false, code: "unavailable" }, { status: 503, headers: privateHeaders });
    }
    return NextResponse.json({ safe: true }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ safe: false, code: "unavailable" }, { status: 503, headers: privateHeaders });
  }
}
