import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MunshiOS",
    short_name: "MunshiOS",
    description: "Business software for Pakistani companies.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfcfa",
    theme_color: "#071821",
    icons: [
      {
        src: "/brand/munshios-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
