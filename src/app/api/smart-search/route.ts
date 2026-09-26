import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { logAIUsage } from "@/lib/ai-usage";
import { rateLimit } from "@/lib/rate-limit";
import { deterministicSearch } from "@/lib/deterministic-search";

// POST /api/smart-search — naravno-jezikovno iskanje po platformi
//
// Uporabnik napiše naravni jezik, npr.:
// - "miren vikend ob reki"
// - "kam z otroki če dežuje"
// - "romantična večerja blizu Bleda"
// - "avantura v gorah z družino"
//
// ISSUE #9 / ZERO-AI (skupina A): iskanje je DETERMINISTIČNO — čisti modul
// src/lib/deterministic-search.ts (normalizacija SL/EN, stopbesede,
// sinonimi/vzdevki → kanonske kategorije, predponsko + Levenshtein
// ujemanje žetonov, uteženo točkovanje polj) nad ISTEMI vrsticami baze,
// ki jih ruta pridobi (destinacije so statični uredniški podatki).
// 0 LLM klicev, 0 tekmovanja z AI verigo — odgovor pride v milisekundah, pošteno
// označen source: "deterministic".
//
// Rezultat je strukturiran z razlago "zakaj" (reason iz DEJANSKIH signalov
// ujemanja — ključne besede/kategorija, nikoli izmišljeno).

interface SmartSearchRequest {
  query: string;
  limit?: number; // default 3 per kategorijo
  /** ISSUE #12 (F12-3, §13): jezik razlogov zadetkov ("en" → EN razlogi;
   *  privzeto SL — nazaj kompatibilno s starejšimi klienti brez polja). */
  locale?: "sl" | "en";
}

interface SearchResults {
  destinations: Array<{
    id: string;
    /** ISSUE #5 T5-B (H1): kanonski slug za navigacijo /destinacija/[slug]
     *  — 4 od 38 destinacij ima id ≠ slug (npr. postojna → postojnska-jama).
     *  Odgovor ga doda iz slovenia-data (iskalnik ga NE izmišlja). */
    slug: string;
    name: string;
    tagline: string;
    reason: string;
    /** ISSUE #12 (F12-1): koordinate destinacije (slovenia-data) — klient
     *  zemljevida z njimi izvede fly-to (iskanje → premik viewporta). */
    lat: number;
    lng: number;
  }>;
  listings: Array<{
    id: string;
    name: string;
    category: string;
    reason: string;
    /** ISSUE #12 (F12-1): geo + slug dopolnitveno prilepljena iz izvorne
     *  vrstice ( Listing.lat/lng iz TASK 86; slug za globoko povezavo).
     *  Opcijsko — vrstice brez geo ostanejo iskrene brez koordinat. */
    slug?: string | null;
    lat?: number | null;
    lng?: number | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    category: string;
    reason: string;
    slug?: string | null;
  }>;
  experiences: Array<{
    id: string;
    name: string;
    category: string;
    reason: string;
    /** ISSUE #12 (F12-1): geo + slug (Experience.lat/lng iz TASK 87). */
    slug?: string | null;
    lat?: number | null;
    lng?: number | null;
  }>;
  summary: string;
  source: "deterministic";
}

export async function POST(request: Request) {
    // Rate limit iskanja
    const limited = rateLimit(request, { limit: 30, windowMs: 600000, key: "smart-search" });
    if (limited) return limited;

  let body: SmartSearchRequest;
  try {
    body = (await request.json()) as SmartSearchRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const query = body?.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Manjka iskalni niz (query)" },
      { status: 400 }
    );
  }

  // CAP-FIX (revizija 1.33.0, 16-b P2): iskalni niz je uporabniški vnos —
  // 300 znakov (iskalni nizi so kratki; prej neomejeno).
  if (query.length > 300) {
    return NextResponse.json(
      { error: "Iskalni niz je predolg (max 300 znakov)" },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(body.limit ?? 3, 1), 5);
  // F12-3: jezik razlogov — samo eksplicitni "en" odpre EN vej (sicer SL;
  // katera koli druga vrednost varno pade v privzeto SL).
  const reasonLocale = body.locale === "en" ? "en" : "sl";

  // === PRIDOBI VSE ITEME IZ BAZE ===
  // ISSUE #12 (F12-1): select zdaj vključuje lat/lng (Listing/Experience —
  // TASK 86/87 geo stolpca) in slug — iskanje na zemljevidu (map-first
  // Discovery) potrebuje koordinate za fly-to + markerje rezultatov.
  // Nazaj kompatibilno: odgovor ima polja OPCIJSKO (additive).
  const [allListings, allProducts, allExperiences] = await Promise.all([
    db.listing.findMany({
      where: { status: "published" },
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, rating: true, priceRange: true,
        slug: true, lat: true, lng: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
    db.product.findMany({
      where: { status: "published" },
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, price: true, rating: true,
        organic: true, handmade: true, vegan: true,
        slug: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
    db.experience.findMany({
      where: { status: "published" },
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, pricePerPerson: true, rating: true,
        familyFriendly: true, durationHours: true,
        slug: true, lat: true, lng: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
  ]);

  // === DETERMINISTIČNO ISKANJE (Issue #9 ZERO-AI) ===
  // Čisti modul nad istimi vrsticami baze + statičnimi destinacijami —
  // 0 omrežnih klicev, 0 AI. Metering: pošten zapis "deterministic"
  // (istega, kar strežemo uporabniku — vir NI AI).
  const meteringStartedAt = Date.now();
  const results = deterministicSearch(
    query,
    {
      listings: allListings,
      products: allProducts,
      experiences: allExperiences,
    },
    limit,
    reasonLocale
  );

  // ISSUE #5 T5-B (H1): id → slug preslikava za navigacijo v hub stran —
  // strežniško prilepljena iz kanonskega dataseta (iskalnik izhod ima le
  // id/ime/razlago; slug NI odvisen od iskanja).
  const destSlugById = new Map(DESTINATIONS.map((d) => [d.id, d.slug] as const));
  // ISSUE #12 (F12-1): id → {lat,lng} destinacij (fly-to klienta) + id →
  // geo/slug dopolnitev vrstičnih zadetkov (Listing/Experience/Product).
  // Iskalni moduli ostanejo ČISTI (isti vhod → isti izhod); dopolnitev je
  // izključno odgovornost rute (en kanon kot destSlugById zgoraj).
  const destGeoById = new Map(
    DESTINATIONS.map((d) => [d.id, { lat: d.coords.lat, lng: d.coords.lng }] as const)
  );
  const listingById = new Map(allListings.map((r) => [r.id, r] as const));
  const productById = new Map(allProducts.map((r) => [r.id, r] as const));
  const experienceById = new Map(allExperiences.map((r) => [r.id, r] as const));

  const anyResults =
    results.destinations.length > 0 ||
    results.listings.length > 0 ||
    results.products.length > 0 ||
    results.experiences.length > 0;

  // Iskren povzetek (strežniško besedilo, brez omembe AI): ni zadetkov →
  // prazni seznami + izrecno sporočilo (ne zavajajoči "ni zadetkov" ob
  // padcu iskanja — iskanje deterministično ne more pasti).
  const summary = anyResults
    ? `Rezultati determinističnega iskanja po ključnih besedah, vzdevkih in kategorijah: "${query}".`
    : `Deterministično iskanje ni našlo zadetkov za "${query}" — poskusi z drugo besedo (npr. kraj, hrana, pohod, vino, muzej).`;

  const response: SearchResults = {
    destinations: results.destinations.map((d) => {
      const geo = destGeoById.get(d.id);
      return {
        id: d.id,
        name: d.name,
        tagline: d.tagline,
        reason: d.reason,
        slug: destSlugById.get(d.id) ?? d.id,
        // F12-1: destinacije VEDNO imajo koordinate (statični dataset);
        // fallback 0/0nikoli (null-island konvencija) ne more nastopiti.
        lat: geo?.lat ?? 0,
        lng: geo?.lng ?? 0,
      };
    }),
    listings: results.listings.map((item) => {
      const row = listingById.get(item.id);
      return {
        ...item,
        slug: row?.slug ?? null,
        lat: row?.lat ?? null,
        lng: row?.lng ?? null,
      };
    }),
    products: results.products.map((item) => ({
      ...item,
      slug: productById.get(item.id)?.slug ?? null,
    })),
    experiences: results.experiences.map((item) => {
      const row = experienceById.get(item.id);
      return {
        ...item,
        slug: row?.slug ?? null,
        lat: row?.lat ?? null,
        lng: row?.lng ?? null,
      };
    }),
    summary,
    source: "deterministic",
  };

  // Issue #4 §11 (val 1) → Issue #9: zapis DEJANSKO izvedenega iskanja —
  // vir je "deterministic" (nikoli "ai" / "fallback").
  logAIUsage({
    feature: "search",
    source: "deterministic",
    success: true,
    responseTimeMs: Date.now() - meteringStartedAt,
    metadata: { query: query.substring(0, 120) },
  });

  console.log(`[smart-search] deterministično iskanje (source: deterministic) — query: "${query}" — najdeno: ${response.destinations.length}d ${response.listings.length}l ${response.products.length}p ${response.experiences.length}e`);

  return NextResponse.json(response);
}
