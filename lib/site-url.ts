export function publicSiteUrl(configured = process.env.NEXT_PUBLIC_SITE_URL) {
  const url = new URL(configured || "https://www.munshios.tech");
  if (url.hostname === "munshios.tech" || url.hostname === "www.munshios.tech") {
    return "https://www.munshios.tech";
  }
  return url.origin;
}
