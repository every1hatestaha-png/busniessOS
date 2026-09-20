import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MunshiOS business software for Pakistani businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#071821",
          color: "white",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#071821",
              fontWeight: 800,
              fontSize: 28,
            }}
          >
            M
          </div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>MunshiOS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "980px" }}>
          <div style={{ color: "#6ee7b7", fontSize: 24, fontWeight: 700 }}>
            Built for Pakistani businesses
          </div>
          <div style={{ fontSize: 66, lineHeight: 1.03, fontWeight: 800, letterSpacing: "-2px" }}>
            Sales, stock, khata and accounting in one connected system.
          </div>
          <div style={{ color: "#cbd5e1", fontSize: 28 }}>
            Manufacturing, wholesale, distribution and growing businesses. First month free.
          </div>
        </div>

        <div style={{ display: "flex", gap: "22px", color: "#94a3b8", fontSize: 20 }}>
          <span>Manufacturing</span>
          <span>Wholesale</span>
          <span>Warehouses</span>
          <span>GST / WHT</span>
        </div>
      </div>
    ),
    size,
  );
}
