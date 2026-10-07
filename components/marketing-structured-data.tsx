import { publicSiteUrl } from "@/lib/site-url";

export function MarketingStructuredData() {
  const siteUrl = publicSiteUrl();

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "MunshiOS",
        url: siteUrl,
        logo: `${siteUrl}/brand/munshios-mark.svg`,
        description: "Business software for Pakistani companies covering sales, purchases, inventory, khata, accounting and operational workflows.",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "MunshiOS",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: "Connected business software for Pakistani manufacturers, wholesalers and growing businesses.",
        offers: {
          "@type": "Offer",
          price: "5000",
          priceCurrency: "PKR",
          description: "PKR 29,000 one-time implementation and PKR 5,000 monthly subscription.",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
