import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRecommendedIds } from "@/lib/ai-recommendations";
import { rateLimit } from "@/lib/rate-limit";
import { toPublicProduct } from "@/lib/public-fields";

// GET /api/recommendations/products?productId=XXX&limit=4&lang=sl|en
// Vrne AI-priporočene podobne izdelke.
// AI (GLM) izbere 4 najbolj smiselne iz 10 SQL kandidatov.
// Rezultati so cachirani 24 ur (memory + data/ai-rec-cache.json).
// P7-C2 (F5.3): dodan rate limit (60/10 min) — prej bi lahko javni bot
// nežnostno sprožal AI klice (cache na Vercelu ni deloval, glej lib).
// ISSUE #4 §20 (1.97.0): vsak item nosi why (eno vrstico razloga, samo
// dejstva iz kandidata) + whySource ("ai" | "deterministic") — ne črn
// AI ranking. lang izbere jezikovno različico (cache hrani obe).
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 10 * 60_000,
    key: "rec-products",
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(4), 10) || 4, 1),
      12
    );
    // §20: jezikovna različica why vrstice (default SL — nazadnje
    // združljivo s prejšnjimi odjemalci, ki parametra ne pošljejo).
    const lang: "sl" | "en" = searchParams.get("lang") === "en" ? "en" : "sl";

    if (!productId) {
      return NextResponse.json(
        { error: "Manjka parameter productId" },
        { status: 400 }
      );
    }

    // P3c-8: tudi referenčni izdelek mora biti objavljen — pending/rejected
    // vrnejo enoten 404 (enaka javna vrata kot /api/products).
    const current = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });

    if (!current || current.status !== "published") {
      return NextResponse.json(
        { error: "Izdelek ni najden" },
        { status: 404 }
      );
    }

    // === AI PRIPOROČILA (z 24h cache) ===
    // §20: whys prihajajo z istim klicem (cache jih nosi v obeh jezikih).
    const { itemIds, whys, source } = await getRecommendedIds("product", productId);

    if (itemIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, source });
    }

    // Pridobi full podatke za AI-izbrane IDs (v vrstnem redu priporočila)
    // P3c-8: kandidati v getRecommendedIds so že filtrirani na published —
    // a cache (24h) lahko zastara (item je medtem umaknjen iz javnosti),
    // zato obrambno filtriramo TUDI tukaj.
    const rows = await db.product.findMany({
      where: { id: { in: itemIds }, status: "published" },
    });

    // Ohrani vrstni red AI priporočila
    const ordered = itemIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, limit);

    // 1.88.1 (FINAL ACCEPTANCE F-B): javna projekcija FW1/R3 — prej je
    // ...p spread v javni JSON puščal ownerId/rejectionReason/submittedAt
    // (ista družina puččov, ki jo je 1.88.0 zaprla na /api/products;
    // ta površina je ostala spregledana).
    // §20: why vrstica po itemu — jezik izbere POIZVEDBA (cache hrani obe
    // različici, zato prvi obiskovalec ne zaključi jezika za vse).
    const whysById = new Map(whys.map((w) => [w.id, w]));
    const products = ordered.map((p) => {
      const w = whysById.get(p.id);
      const why = w ? (lang === "en" ? w.en : w.sl) : "";
      const whySource = w ? (lang === "en" ? w.sourceEn : w.sourceSl) : undefined;
      return {
        ...toPublicProduct(p),
        images: JSON.parse(p.images || "[]") as string[],
        // §20: razložljivo priporočilo — SAMO če vrstica obstaja (praznih
        // razlogov ne izmišljujemo; fallback vsebuje vedno ime kandidata).
        ...(why ? { why, whySource } : {}),
      };
    });

    return NextResponse.json({ products, total: products.length, source });
  } catch (error) {
    console.error("[recommendations/products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri priporočilih izdelkov" },
      { status: 500 }
    );
  }
}
