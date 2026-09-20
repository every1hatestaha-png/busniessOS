import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-one-gules.vercel.app";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/features", "/industries", "/pricing", "/get-your-munshi", "/privacy", "/terms"],
      disallow: [
        "/api/",
        "/admin/",
        "/platform/",
        "/onboarding/",
        "/subscription/",
        "/sign-in",
        "/sign-up",
        "/account-recovery/",
        "/forgot-password/",
        "/desktop-auth/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
