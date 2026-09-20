import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-one-gules.vercel.app";
  const routes = ["/", "/get-your-munshi", "/features", "/industries", "/industries/manufacturing", "/industries/wholesale", "/pricing", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/get-your-munshi" ? 0.9 : 0.7,
  }));
}
