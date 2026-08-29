import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const EXPO_WEB_DEV_PORTS = new Set(["8081", "8082", "8083", "19006"]);

export function isApiV1Request(pathname: string) {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

export function getAllowedCorsOrigin(origin: string | null) {
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }

  const isLocalExpoWeb =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    EXPO_WEB_DEV_PORTS.has(url.port);

  return isLocalExpoWeb ? origin : null;
}

export function applyCorsHeaders(response: Response, origin: string | null) {
  const allowedOrigin = getAllowedCorsOrigin(origin);
  if (!allowedOrigin) return response;

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.append("Vary", "Origin");
  return response;
}

export function corsPreflightResponse(request: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), request.headers.get("origin"));
}
