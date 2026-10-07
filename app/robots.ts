import { publicSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = publicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/product", "/security", "/industries", "/pricing", "/get-your-munshi", "/privacy", "/terms", "/cookies", "/refund-policy"],
      disallow: ["/legal/", 
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
