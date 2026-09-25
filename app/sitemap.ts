import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-khzr.vercel.app";
  const routes = [
    "/",
    "/get-your-munshi",
    "/features",
    "/industries",
    "/industries/manufacturing",
    "/industries/wholesale",
    "/industries/retail",
    "/industries/restaurant",
    "/industries/services",
    "/pricing",
    "/privacy",
    "/terms",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/get-your-munshi" ? 0.9 : route.startsWith("/industries/") ? 0.8 : 0.7,
  }));
}
