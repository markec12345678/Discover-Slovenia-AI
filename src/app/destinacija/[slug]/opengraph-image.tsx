import { ImageResponse } from "next/og";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Discover Slovenia AI — destinacija";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundImage: `linear-gradient(135deg, rgba(45,106,62,0.85) 0%, rgba(20,60,35,0.95) 100%), url(${dest?.image || ""})`,
          backgroundSize: "cover",
          padding: "60px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "auto" }}>
          <span style={{ fontSize: 36 }}>🇸🇮</span>
          <span style={{ fontSize: 28, fontWeight: 600, opacity: 0.9 }}>Discover Slovenia AI</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h1 style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, margin: 0 }}>
            {dest?.name || "Slovenija"}
          </h1>
          {dest && (
            <>
              <p style={{ fontSize: 32, opacity: 0.85, margin: 0, maxWidth: 900 }}>
                {dest.tagline}
              </p>
              <div style={{ display: "flex", gap: "24px", marginTop: "12px" }}>
                <span style={{ fontSize: 28, background: "rgba(255,255,255,0.2)", padding: "8px 20px", borderRadius: 12 }}>
                  ⭐ {dest.rating}
                </span>
                <span style={{ fontSize: 28, background: "rgba(255,255,255,0.2)", padding: "8px 20px", borderRadius: 12 }}>
                  📍 {dest.region}
                </span>
                <span style={{ fontSize: 28, background: "rgba(255,255,255,0.2)", padding: "8px 20px", borderRadius: 12 }}>
                  💰 {dest.budget}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
