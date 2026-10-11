import { publicSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = publicSiteUrl();
  const routes = [
    "/",
    "/get-your-munshi",
    "/product",
    "/security",
    "/industries",
    "/industries/manufacturing",
    "/industries/wholesale",
    "/industries/retail",
    "/industries/restaurant",
    "/industries/services",
    "/pricing",
    "/privacy",
    "/terms",
    "/cookies",
    "/refund-policy",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/get-your-munshi" ? 0.9 : route.startsWith("/industries/") ? 0.8 : 0.7,
  }));
}
