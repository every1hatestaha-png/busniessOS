import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";
const isProduction = process.env.NODE_ENV === "production";

function buildContentSecurityPolicy(formAction: string) {
  return [
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `form-action ${formAction}`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const customerContentSecurityPolicy = buildContentSecurityPolicy("'self'");
const legacyClerkContentSecurityPolicy = buildContentSecurityPolicy(
  "'self' https://*.clerk.accounts.dev https://accounts.clerk.com",
);

const securityHeaders = [
  { key: "Content-Security-Policy", value: customerContentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const legacyClerkCspHeader = [
  { key: "Content-Security-Policy", value: legacyClerkContentSecurityPolicy },
];

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  ...(isVercelBuild ? {} : { output: "standalone" as const }),
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/adapter-pg/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Customer web is Supabase-only, so Clerk form targets are not allowed on
      // normal pages. Keep the broader form-action allowlist scoped strictly to
      // the legacy Clerk surfaces that still need it during the migration.
      {
        source: "/platform/:path*",
        headers: legacyClerkCspHeader,
      },
      {
        source: "/desktop-auth/:path*",
        headers: legacyClerkCspHeader,
      },
      {
        source: "/__clerk/:path*",
        headers: legacyClerkCspHeader,
      },
      {
        source: "/api/v1/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/sign-in/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/sign-up/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/forgot-password/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/account-recovery/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/recovery/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/auth/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/onboarding/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/legal/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/api/legal/:path*",
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
