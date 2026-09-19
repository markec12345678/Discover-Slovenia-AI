// ============================================================================
// TRAVEL SUPPLY MAP — TRAVELPAYOUTS: KANONSKA PRESLIKAVA (TASK 53, 1.58.0)
// ============================================================================
// TravelpayoutsPriceItem → ProviderProduct. KANONSKI MODEL SE NE SPREMENJA
// (glavni gate naročnika §4): nobeno travelpayouts* polje ne pride v
// ProviderProduct — vse specifike vira ostanejo v tej mapi (izjema po
// arhitekturi: (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type:            „flight“ (kanonska kategorija; register: minZoom 7)
//  - subcategory:     transfers===0 → „direct_flight“; transfers>0 →
//                     „connecting_flight“ (IZPELJANO iz vira; neznano →
//                     brez podtipa — NE izmišljujemo)
//  - title:           SL „Let <origin> → <destination> (<airline>)“ /
//                     EN „Flight <origin> → <destination> (<airline>)“
//                     (IATA mesti iz vira; letalska družba SAMO če je podana)
//  - geo:             NAMERNO BREZ lat/lng/geoPrecision/address — let je
//                     ROUTE (izhodišče→cilj), NE točka na zemljevidu.
//                     Pripeti pin bi bilo GEOGRAFSKA LAŽ (leta ne pristanejo
//                     v središču destinacije). Sloj letov je zato brez pinov
//                     (kartica/plast, enako načelo kot „route“ semantika
//                     transferjev pri KiwiTaxi, a še strožje — NI repin).
//  - cena:            price → PriceInfo {unit: per_person, fromPrice: true,
//                     note „predpomnjena najnižja cena (ni živi citat)“} —
//                     Data API streže PREDPOMNJENE najnižje cene (agregat
//                     vira), to NISO živi citati; valuta SAMO kadar je vir
//                     potrdil eur (NE pretvarjamo, NE lažemo o valuti);
//                     cena 0 NI cena (fail-closed)
//  - razpoložljivost: „unknown“ — vir ima koncept sedežev, a Data API ne
//                     poroča zasedenosti; predpomnjena cena NI dokaz
//  - bookingMode:     affiliate_redirect; bookingUrl = /go/flights?dest=
//                     {kanonska destinacija} (NAŠA konstrukcija; /go razreši
//                     partnerjevo iskanje prek whitelist destinacij)
//  - sourceUrl:       NAMERNO IZPUŠČENO — „link“ polje vira je RELATIVNO
//                     („/search/…“), absolutnega domnevnega URL-ja NE
//                     fabriciramo (§22 meja zaupanja)
//  - lastUpdated:     ISO čas uspešne pridobitve od vira (fetchedAt)
//  - license:         {source: "Travelpayouts Data API"}
//  - ID:              „travelpayouts:<origin>-<destination>-<sufiks>“ —
//                     sufiks = DATUM odhoda (YYYYMMDD; stabilen med
//                     osvežitvami predpomnilnika vira — čas odhoda se lahko
//                     spremeni, datum smeri pa ostane) ali določen hash
//                     (airline|price|transfers) kadar departure_at manjka
// ============================================================================

import type { ProviderProduct, PriceInfo } from "../../types";
import type { TravelpayoutsPriceItem } from "./types";

/** Kapika rezultatov adapterja (gostota pod nadzorom). */
export const TRAVELPAYOUTS_MAX_RESULTS = 48;

/** Opomba cene — odkritje iskrenosti: Data API = PREDPOMNJENE cene. */
const PRICE_NOTE = {
  sl: "predpomnjena najnižja cena (ni živi citat)",
  en: "cached lowest price (not a live quote)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZaupANEGA VIRA (§22 — isti vzorec kot viator mapper:
// kontrolni znaki + HTML/JS injekcijski znaki stran, presledki zložijo,
// kap dolžine). IATA kode/letalske družbe/številke letov so prosti nizi
// komercialnega API-ja, ki ga ne nadzorujemo.
// ---------------------------------------------------------------------------

const FIELD_MAX_LEN = 120;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski znakovni nabor). */
function cleanTravelpayoutsText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Normalizirana IATA koda (trim + uppercase — validator je dovolil male). */
export function cleanIata(raw: string): string {
  return raw.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// STABILEN ID (determinističen — preslikava istega zapisa vira VEDNO da
// isti id; ključno za dedupe/Add-to-plan/AI FIXED izbire med sejami)
// ---------------------------------------------------------------------------

/**
 * Deterministični hash (djb2, base36) — zadostni sufiks ID-ja kadar
 * departure_at manjka (isti zapis vira → isti id; različna zapisa z enakimi
 * airline|price|transfers sta za naš sloj isti ponudbi).
 */
function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Sufiks ID-ja: datum odhoda (stabilen) ali določen hash. */
export function priceItemSuffix(item: TravelpayoutsPriceItem): string {
  const dep = typeof item.departure_at === "string" ? item.departure_at.trim() : "";
  // Datumski del (YYYY-MM-DD) je dovolj za identiteto „predpomnjene cene za ta datum“; čas odhoda se med osvežitvami predpomnilnika vira lahko
  // spremeni in NE SME raztresati identitete.
  if (/^\d{4}-\d{2}-\d{2}/.test(dep)) {
    return dep.slice(0, 10).replace(/-/g, "");
  }
  return stableHash(
    [item.airline ?? "", item.price ?? "", item.transfers ?? ""].join("|")
  );
}

// ---------------------------------------------------------------------------
// OPIS — IZKLJUČNO iz podatkov vira (prestopi/trajanje/odhod/let)
// ---------------------------------------------------------------------------

/** Trajanje v minutah → berljiv niz (DOCUMENTED-ASSUMPTION: enota minute). */
function durationText(min: number, locale: "sl" | "en"): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (locale === "en") {
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function buildDescription(
  item: TravelpayoutsPriceItem,
  locale: "sl" | "en"
): string | undefined {
  const parts: string[] = [];
  if (typeof item.transfers === "number" && Number.isFinite(item.transfers)) {
    if (item.transfers === 0) {
      parts.push(locale === "en" ? "Direct flight" : "Direktni let");
    } else if (locale === "en") {
      parts.push(`${item.transfers} stop${item.transfers > 1 ? "s" : ""}`);
    } else {
      // Slovenska morfologija števca: 1 prestop / 2 prestopa /
      // 3–4 prestopi / 5+ prestopov (dvojina ni „prestopi“).
      const n = item.transfers;
      const noun =
        n === 1 ? "prestop" : n === 2 ? "prestopa" : n <= 4 ? "prestopi" : "prestopov";
      parts.push(`${n} ${noun}`);
    }
  }
  if (
    typeof item.duration === "number" &&
    Number.isFinite(item.duration) &&
    item.duration > 0
  ) {
    parts.push(
      locale === "en"
        ? `duration ~${durationText(item.duration, "en")}`
        : `trajanje ~${durationText(item.duration, "sl")}`
    );
  }
  if (typeof item.departure_at === "string" && item.departure_at.trim().length > 0) {
    parts.push(
      locale === "en"
        ? `departure ${item.departure_at.trim().slice(0, 25)}`
        : `odhod ${item.departure_at.trim().slice(0, 25)}`
    );
  }
  const airline =
    typeof item.airline === "string" ? cleanTravelpayoutsText(item.airline, 20) : "";
  const flightNo =
    typeof item.flight_number === "string"
      ? cleanTravelpayoutsText(item.flight_number, 10)
      : "";
  if (airline && flightNo) {
    parts.push(
      locale === "en" ? `flight ${airline} ${flightNo}` : `let ${airline} ${flightNo}`
    );
  } else if (airline) {
    parts.push(
      locale === "en" ? `carrier ${airline}` : `prevoznik ${airline}`
    );
  }
  return parts.length > 0 ? parts.join(locale === "en" ? ", " : ", ") : undefined;
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface TravelpayoutsMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
  /**
   * Ali je vir POTRDIL valuto eur (odgovor currency === „eur“ ali polje
   * odstopa) — brez potrditve cene NE preslikamo (ne pretvarjamo).
   */
  currencyConfirmedEur: boolean;
  /**
   * Kanonska destinacija (slug iz slovenia-data) povezana s poizvedbo —
   * iz nje gradimo /go/flights?dest= (whitelist destinacij v /go ruti).
   */
  canonicalDest: string;
}

export function travelpayoutsItemToProduct(
  item: TravelpayoutsPriceItem,
  ctx: TravelpayoutsMapperContext
): ProviderProduct | null {
  const { locale } = ctx;

  // KRITIČNI polji (validator ju že zahteval — obrambno še enkrat:
  // meja adapterja velja za VSAKEGA klicatelja, §22).
  const origin = typeof item.origin === "string" ? cleanIata(item.origin) : "";
  const destination =
    typeof item.destination === "string" ? cleanIata(item.destination) : "";
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return null;

  const airline =
    typeof item.airline === "string" ? cleanTravelpayoutsText(item.airline, 20) : "";

  const title = airline
    ? locale === "en"
      ? `Flight ${origin} → ${destination} (${airline})`
      : `Let ${origin} → ${destination} (${airline})`
    : locale === "en"
      ? `Flight ${origin} → ${destination}`
      : `Let ${origin} → ${destination}`;

  // === Cena (SAMO ob numerični ceni > 0 + potrjeni valuti eur) ===
  const price = item.price;
  const hasPrice =
    ctx.currencyConfirmedEur &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0;
  const priceInfo: PriceInfo | undefined = hasPrice
    ? {
        amount: Math.round((price as number) * 100) / 100,
        currency: "EUR",
        unit: "per_person",
        fromPrice: true,
        note: PRICE_NOTE[locale],
      }
    : undefined;

  // === subcategory (IZPELJANO iz prestopov vira — ni lastna ocena) ===
  let subcategory: string | undefined = undefined;
  if (typeof item.transfers === "number" && Number.isFinite(item.transfers)) {
    subcategory = item.transfers === 0 ? "direct_flight" : "connecting_flight";
  }

  const description = buildDescription(item, locale);

  const product: ProviderProduct = {
    id: `travelpayouts:${origin}-${destination}-${priceItemSuffix(item)}`,
    provider: "travelpayouts",
    providerProductId: `${origin}-${destination}-${priceItemSuffix(item)}`,
    type: "flight",
    ...(subcategory ? { subcategory } : {}),
    title,
    ...(description ? { description } : {}),
    // geo: NAMERNO ODSOTNO — let je route (izhodišče→cilj), ne pin (glej
    // glavo mape). Koordinate NE izmišljujemo.
    ...(priceInfo ? { price: priceInfo } : {}),
    availability: {
      status: "unknown" as const,
      note: AVAILABILITY_NOTE[locale],
    },
    bookingMode: "affiliate_redirect" as const,
    // NAŠA konstrukcija (ne provider URL): /go/flights validira destinacijo
    // (whitelist → kanonična) in dostavi partnerjevo iskanje letov.
    bookingUrl: `/go/flights?dest=${encodeURIComponent(ctx.canonicalDest)}`,
    // sourceUrl: NAMERNO ODSOTEN — „link“ vira je relativen („/search/…“),
    // absolutnega URL-ja NE fabriciramo.
    lastUpdated: ctx.fetchedAt,
    license: {
      source: "Travelpayouts Data API",
    },
  };

  return product;
}

/**
 * Preslikaj seznam elementov (fail-safe: slab zapis odpade + števec —
 * §22: vsak VHOD preverimo tudi tu, meja adapterja velja za VSAKEGA
 * klicatelja, ne samo adapterjevo pot).
 */
export function mapTravelpayoutsPrices(
  items: TravelpayoutsPriceItem[],
  ctx: TravelpayoutsMapperContext
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const item of items) {
    const p = travelpayoutsItemToProduct(item, ctx);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
