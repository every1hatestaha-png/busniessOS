export function MarketingStructuredData() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://business-os-one-gules.vercel.app";

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
          price: "0",
          priceCurrency: "PKR",
          description: "First 30 days free. Paid plans start after the trial.",
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
