// ============================================================================
// TRAVEL SUPPLY MAP — SKYSCANNER: KANONSKA PRESLIKAVA (Task 53, 1.58.0)
// ============================================================================
// SkyscannerPollResponse → ProviderProduct (tip "flight"). Kanonski model
// se NE spremeni — vse skyscanner specifike ostanejo v tej mapi (izjema po
// arhitekturi: (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type:            vedno "flight" (plast je letalska — naročnik §9)
//  - title:           IZKLJUČNO iz surovega odgovora: prva etapa (leg_ids[0])
//                     → ime izvornega in ciljnega place + ime prevoznika
//                     (naša slovenska/angleška oznaka „Let"/„Flight" je
//                     LASTNA oznaka, vsebina je vira). Eta se NE razreši
//                     → zapis PRESKOČEN (fail-closed, nikoli izmišljen).
//  - geo:             pin = place, ki UJEMA iskano destinacijo (id ===
//                     destination_place_id, sicer ime == kanonsko ime) IN
//                     ima koordinate v surovem odgovoru → geoPrecision
//                     "city" (destinacijski pin, NE točka pristanka).
//                     Brez ujemanja NI pina (nikoli ne izmišljujemo).
//  - cena:            pricing_options[0].price.amount → „od"-cena (prva
//                     opcija je najnižja po razvrstitvi vira) v EUR
//                     (valuto ZAHTEVAMO v poizvedbi — pogodba) + enota
//                     per_person (iskali smo adults=1 — poštena semantika
//                     na odraslo osebo; skupna cena skupine pri ponudniku)
//  - razpoložljivost: "unknown" (vir koncept ima — žive cene so citat,
//     a sedežev/razpoložljivosti NE preverjamo) — NIKOLI "available"
//  - slika:           BREZ (itinerary nima slik — iskreno izpuščeno)
//  - bookingMode:     affiliate_redirect; bookingUrl = /go/flights?dest=
//                     {kanonski slug} (NAŠA konstrukcija — CTA teče prek
//                     /go po arhitekturi; affiliate.ts razreši sledenje)
//  - sourceUrl:       pricing_options[0].deep_link validiran https na
//                     skyscanner.net gostitelju (živa globoka povezava
//                     vira — render: safeExternalHref)
//  - licenca:         "Skyscanner Travel API" / "© Skyscanner"
// ============================================================================

import type { ProviderProduct } from "../../types";
import type {
  SkyscannerCarrier,
  SkyscannerItinerary,
  SkyscannerLeg,
  SkyscannerPlace,
  SkyscannerPollResponse,
} from "./types";
import { isSkyscannerItinerary } from "./types";

/** Kapica rezultatov adapterja (gostota pod nadzorom). */
export const SKYSCANNER_MAX_RESULTS = 48;

/** Opomba cene (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE = {
  sl: "cena leta na odraslo osebo (gospodarski)",
  en: "flight price per adult (economy)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

/** Oznaka kabine — LASTNA oznaka (poizvedba je gospodarski razred). */
const CABIN_LABEL = {
  sl: "gospodarski razred",
  en: "economy class",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZAUPANEGA VIRA (§22 — isti vzorec kot viator mapper:
// React escaping je DRUGA plast, meja adapterja je PRVA — namerno OBA)
// ---------------------------------------------------------------------------

const TITLE_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski nabor). */
function cleanSkyscannerText(raw: string, maxLen: number): string {
  return raw
    // kontrolni znaki (vključno DEL) — lomijo izris/dnevnike
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // HTML/js injekcijski znaki (enak nabor kot viator cleanViatorText)
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// DEEP LINK — §22 meja zaupanja za NEZAUPAN vir (https + skyscanner host)
// ---------------------------------------------------------------------------

/**
 * deep_link vira mora biti https NA skyscanner.net (vključno uradnih
 * poddomen). Vse ostalo (http, javascript:, data:, tuji host) → undefined
 * (NE izmišljujemo, NE predpomnimo — fail-closed).
 */
export function skyscannerDeepLinkUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 1000) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname.toLowerCase();
    if (h !== "skyscanner.net" && !h.endsWith(".skyscanner.net")) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// PIN — IZKLJUČNO iz places[] surovega odgovora (nikoli izmišljen)
// ---------------------------------------------------------------------------

interface ResolvedPin {
  lat: number;
  lng: number;
  name: string;
}

/** Veljavne koordinate place vira (širina/dolžina v mejah). */
function placeCoords(p: SkyscannerPlace): { lat: number; lng: number } | null {
  const lat = p.coordinates?.latitude;
  const lng = p.coordinates?.longitude;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { lat, lng };
}

/**
 * Razreši pin destinacije IZ SUROVEGA odgovora:
 *  1. place z id === iskani destination_place_id (pogodbena identiteta),
 *  2. sicer place, katerega ime se ujema s kanonskim imenom destinacije.
 * Ni ujemanja / ni koordinat → null (pin ODSOTEN — iskreno).
 */
function resolveDestinationPin(
  places: SkyscannerPlace[],
  ctx: { destinationPlaceId: string; canonicalName: string }
): ResolvedPin | null {
  const byId = places.find((p) => p && p.id === ctx.destinationPlaceId);
  if (byId) {
    const coords = placeCoords(byId);
    if (coords && typeof byId.name === "string" && byId.name.trim().length > 0) {
      return { ...coords, name: byId.name };
    }
  }
  const needle = ctx.canonicalName.trim().toLowerCase();
  const byName = places.find(
    (p) =>
      p &&
      typeof p.name === "string" &&
      p.name.trim().toLowerCase() === needle
  );
  if (byName) {
    const coords = placeCoords(byName);
    if (coords) {
      return { ...coords, name: (byName.name as string).trim() };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface SkyscannerMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
  /** Kanonska destinacija (slug za /go/flights?dest=, ime za pin). */
  canonical: { slug: string; name: string };
  /** Iskani destination place id (pogodbena identiteta pina). */
  destinationPlaceId: string;
}

/** Rezultat preslikave (iskrena telemetrija skipped + opomba). */
export interface SkyscannerMapResult {
  products: ProviderProduct[];
  skipped: number;
  /** Npr. "capped" (presežena zgornja meja rezultatov). */
  note?: string;
}

/**
 * Preslikaj itinerarije poll odgovora v kanonske produktne zapise.
 * STRICT fail-closed: zapis brez veljavnega id-ja ALI brez razrešljive
 * etape (izvor→cilj po imenih vira) se PRESKOČI in prešteje — nikoli
 * delno izmišljen. Cena je opcijska (samo numerična, > 0 — NIKOLI 0).
 */
export function mapSkyscannerItineraries(
  raw: SkyscannerPollResponse,
  ctx: SkyscannerMapperContext
): SkyscannerMapResult {
  const { locale, fetchedAt } = ctx;

  const itineraries = Array.isArray(raw.itineraries) ? raw.itineraries : [];
  const legs = Array.isArray(raw.legs) ? raw.legs : [];
  const places = Array.isArray(raw.places) ? raw.places : [];
  const carriers = Array.isArray(raw.carriers) ? raw.carriers : [];

  const legById = new Map<string, SkyscannerLeg>();
  for (const l of legs) {
    if (l && typeof l.id === "string" && l.id.length > 0) legById.set(l.id, l);
  }
  const placeById = new Map<string, SkyscannerPlace>();
  for (const p of places) {
    if (p && typeof p.id === "string" && p.id.length > 0) placeById.set(p.id, p);
  }
  const carrierById = new Map<string, SkyscannerCarrier>();
  for (const c of carriers) {
    if (c && typeof c.id === "string" && c.id.length > 0) carrierById.set(c.id, c);
  }

  const pin = resolveDestinationPin(places, {
    destinationPlaceId: ctx.destinationPlaceId,
    canonicalName: ctx.canonical.name,
  });

  const products: ProviderProduct[] = [];
  let skipped = 0;
  let capped = false;

  for (const item of itineraries) {
    if (products.length >= SKYSCANNER_MAX_RESULTS) {
      // Presežene kapice: preostali veljavni zapisi se zavrnejo (iskren
      // števec skipped + opomba "capped" v adapterju).
      capped = true;
      skipped++;
      continue;
    }
    if (!isSkyscannerItinerary(item)) {
      skipped++;
      continue;
    }

    // === Eta (leg) — izvor/cilj po imenih vira (kritično polje) ===
    const legId = Array.isArray(item.leg_ids)
      ? item.leg_ids.find((id) => typeof id === "string" && legById.has(id))
      : undefined;
    const leg = legId ? legById.get(legId) : undefined;
    const originPlace =
      typeof leg?.origin_place_id === "string"
        ? placeById.get(leg.origin_place_id)
        : undefined;
    const destinationPlace =
      typeof leg?.destination_place_id === "string"
        ? placeById.get(leg.destination_place_id)
        : undefined;
    const originName =
      originPlace && typeof originPlace.name === "string"
        ? cleanSkyscannerText(originPlace.name, 120)
        : "";
    const destinationName =
      destinationPlace && typeof destinationPlace.name === "string"
        ? cleanSkyscannerText(destinationPlace.name, 120)
        : "";
    if (originName.length === 0 || destinationName.length === 0) {
      // Brez razrešljive poti (izvor→cilj) ni poštenega produkta.
      skipped++;
      continue;
    }

    // === Prevoznik (ime iz carriers[] vira — opcijsko) ===
    const carrierId =
      leg && Array.isArray(leg.carriers)
        ? leg.carriers.find(
            (id) => typeof id === "string" && carrierById.has(id)
          )
        : undefined;
    const carrierEntry =
      carrierId != null ? carrierById.get(carrierId) : undefined;
    const carrierName =
      typeof carrierEntry?.name === "string"
        ? cleanSkyscannerText(carrierEntry.name, 80)
        : "";

    // === Naslov: LASTNA oznaka + vsebina vira ===
    const prefix = locale === "en" ? "Flight" : "Let";
    const title = cleanSkyscannerText(
      `${prefix} ${originName} → ${destinationName}${
        carrierName.length > 0 ? ` · ${carrierName}` : ""
      }`,
      TITLE_MAX_LEN
    );

    // === Cena (prva pricing option = najnižja po razvrstitvi vira) ===
    const pricing =
      Array.isArray(item.pricing_options) && item.pricing_options.length > 0
        ? item.pricing_options[0]
        : undefined;
    const amount = pricing?.price?.amount;
    const hasPrice =
      typeof amount === "number" &&
      Number.isFinite(amount) &&
      amount > 0;

    // === Opis: IZKLJUČNO iz podatkov vira + lastne oznake ===
    const descParts: string[] = [];
    if (carrierName.length > 0) {
      descParts.push(carrierName);
    }
    if (
      typeof leg?.departure_date_time === "string" &&
      leg.departure_date_time.trim().length > 0
    ) {
      descParts.push(
        `${locale === "en" ? "Departure" : "Odhod"}: ${cleanSkyscannerText(
          leg.departure_date_time,
          40
        )}`
      );
    }
    if (
      typeof leg?.duration === "number" &&
      Number.isFinite(leg.duration) &&
      leg.duration > 0
    ) {
      descParts.push(
        `${
          locale === "en" ? "Duration" : "Trajanje"
        }: ${Math.round((leg.duration / 60) * 10) / 10} h`
      );
    }
    descParts.push(CABIN_LABEL[locale]);
    const description = descParts
      .join("\n")
      .slice(0, DESCRIPTION_MAX_LEN);

    // === sourceUrl (deep_link vira — validiran https skyscanner host) ===
    const deepLink =
      typeof pricing?.deep_link === "string"
        ? skyscannerDeepLinkUrl(pricing.deep_link)
        : undefined;

    const product: ProviderProduct = {
      id: `skyscanner:${item.id}`,
      provider: "skyscanner",
      providerProductId: item.id,
      type: "flight",
      title,
      description,
      // geo: pin LE iz places[] vira (geoPrecision "city" — destinacijski)
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
      ...(pin ? { geoPrecision: "city" as const } : {}),
      ...(pin ? { address: cleanSkyscannerText(pin.name, 120) } : {}),
      ...(hasPrice
        ? {
            price: {
              amount: Math.round((amount as number) * 100) / 100,
              currency: "EUR" as const,
              unit: "per_person" as const,
              fromPrice: true,
              note: PRICE_NOTE[locale],
            },
          }
        : {}),
      availability: {
        status: "unknown" as const,
        note: AVAILABILITY_NOTE[locale],
      },
      bookingMode: "affiliate_redirect" as const,
      // NAŠA konstrukcija (CTA arhitektura teče prek /go — affiliate.ts
      // doda sledenje; dest = kanonski slug iz whitelist).
      bookingUrl: `/go/flights?dest=${encodeURIComponent(ctx.canonical.slug)}`,
      ...(deepLink ? { sourceUrl: deepLink } : {}),
      lastUpdated: fetchedAt,
      license: {
        source: "Skyscanner Travel API",
        attribution: "© Skyscanner",
      },
    };

    products.push(product);
  }

  return {
    products,
    skipped,
    ...(capped ? { note: "capped" } : {}),
  };
}
