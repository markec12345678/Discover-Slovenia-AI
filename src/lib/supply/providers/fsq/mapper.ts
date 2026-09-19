// ============================================================================
// TRAVEL SUPPLY MAP — FSQ: KANONSKA PRESLIKAVA (TASK 53, 1.58.0)
// ============================================================================
// FsqPlace → ProviderProduct. KANONSKI MODEL SE NE SPREMENJA (glavni gate
// naročnika §4): nobeno fsq* polje ne pride v ProviderProduct — vse
// specifike vira ostanejo v tej mapi (izjema po arhitekturi: (provider,
// providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type/subcategory: kategorije vira → kanonska taksonomija (FSQ_CATEGORY_MAP
//                     v dataset.ts: Restaurant/Café → restaurant, Hotel →
//                     accommodation, Museum → museum …; brez zadetka → poi)
//  - title:           name vira (očiščen prosti tekst)
//  - geo:             latitude/longitude vira — TOČNA lokacija objekta →
//                     geoPrecision „exact“ (edini vir koordinat so SUIH
//                     podatki vira; koordinat NE izpeljujemo)
//  - address:         address.formatted_address ALI sestavek street +
//                     locality (IZKLJUČNO iz polj vira)
//  - ocena:           stats.rating (0–5) SAMO kadar je prisotna + končna
//                     reviewCount = stats.rating_count (dokazano povezan
//                     par v shemi; vrhnje „rating“ polje NAMERNO neuporabljeno
//                     — brez rating_count bi bila ocena brez dokaza)
//  - kontakt:         tel → phone; website → sourceUrl (validiran https —
//                     javno ureljivi odprti podatki, zato meja zaupanja §22)
//  - openingHours:    hours (niz v shemi) SAMO kadar je niz
//  - cena:            NAMERNO ODSOTNA — odprti podatki krajev cen NE vsebujejo
//                     (NE izmišljujemo „0 €“)
//  - razpoložljivost: NAMERNO IZPUŠČENO polje — vir koncepta nima
//                     (dokumentirana semantika: ODSOTNO polje = not_supported)
//  - bookingMode:     „info_only“ (lokalni odprti vir — brez rezervacije,
//                     kontakt/website sta pot do kraja)
//  - bookingUrl:      NAMERNO ODSOTEN (info_only)
//  - imageCredit:     NAMERNO ODSOTEN (množica slik NE vsebuje — NE
//                     hotlinkamo tujih slik)
//  - lastUpdated:     date_refreshed kraja ALI mtime datoteke množice (ISO)
//  - license:         {source: "Foursquare Open Places (OS Places)",
//                     attribution: "© Foursquare / Open Places Apache-2.0"}
//                     (Apache-2.0 zahteva atribucijo — izpisujemo povsod)
// ============================================================================

import type { ProviderProduct } from "../../types";
import type { FsqPlace } from "./types";
import { isFsqPlace } from "./types";
import { fsqCategoryType } from "./dataset";

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZaupANEGA VIRA (§22 — isti vzorec kot viator/kiwitaxi
// mapper: kontrolni znaki + HTML/JS injekcijski znaki stran, presledki
// zložijo, kap dolžine). Ime/naslov/telefon/ure so prosti nizi odprtih
// podatkov, ki jih lahko KDORAVKOL ureja (javno ureljiv vir!).
// ---------------------------------------------------------------------------

const NAME_MAX_LEN = 200;
const ADDRESS_MAX_LEN = 300;
const PHONE_MAX_LEN = 40;
const HOURS_MAX_LEN = 200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski znakovni nabor). */
function cleanFsqText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// SOURCEURL — meja zaupanja za website odprtega (javno ureljivega) vira
// ---------------------------------------------------------------------------

/**
 * §22 meja zaupanja za website kraja: SAMO https + razumljiv hostname.
 * Http/javascript:/data:/ relative smeti → undefined (vir ODSOTEN — NE
 * izmišljujemo, NE predpomnimo; render sloj ima safeExternalHref kot
 * drugo plast, adapter je PRVA meja).
 */
export function fsqSourceUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    // hostname mora vsebovati piko (goli TLD/localhost NE — obrambno).
    if (!parsed.hostname.includes(".")) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Naslov kraja: formatted_address ALI sestavek street + locality (vir). */
function fsqAddressString(place: FsqPlace): string | undefined {
  const a = place.address;
  if (!a || typeof a !== "object") return undefined;
  const formatted =
    typeof a.formatted_address === "string" && a.formatted_address.trim().length > 0
      ? cleanFsqText(a.formatted_address, ADDRESS_MAX_LEN)
      : "";
  if (formatted.length > 0) return formatted;
  const street = typeof a.street === "string" ? cleanFsqText(a.street, 150) : "";
  const locality = typeof a.locality === "string" ? cleanFsqText(a.locality, 100) : "";
  const parts = [street, locality].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface FsqMapperContext {
  /**
   * ISO 8601 — date_refreshed kraja ALI mtime datoteke množice
   * (semantika lastUpdated; izračuna adapter iz indeksa).
   */
  lastUpdated: string;
}

export function mapFsqPlace(
  place: FsqPlace,
  ctx: FsqMapperContext
): ProviderProduct | null {
  // Obrambno: meja adapterja velja za VSAKEGA klicatelja (§22) — tudi če
  // je klicalec obšel validacijo nalagalne plasti.
  if (!isFsqPlace(place)) return null;

  const fsqId = place.fsq_id.trim();
  const title = cleanFsqText(place.name, NAME_MAX_LEN);
  if (title.length === 0) return null; // ime po čiščenju prazno → ni produkta

  const { type, subcategory } = fsqCategoryType(place);

  // === Ocena: SAMO iz stats (rating 0–5 + rating_count kot dokaz) ===
  const statsRating = place.stats?.rating;
  const statsCount = place.stats?.rating_count;
  const hasRating =
    typeof statsRating === "number" &&
    Number.isFinite(statsRating) &&
    statsRating > 0 &&
    statsRating <= 5;
  const hasReviewCount =
    typeof statsCount === "number" && Number.isFinite(statsCount) && statsCount > 0;

  // === Kontakt (samo iz vira) ===
  const phone =
    typeof place.tel === "string" && place.tel.trim().length > 0
      ? cleanFsqText(place.tel, PHONE_MAX_LEN)
      : undefined;
  const sourceUrl = fsqSourceUrl(place.website);
  const openingHours =
    typeof place.hours === "string" && place.hours.trim().length > 0
      ? cleanFsqText(place.hours, HOURS_MAX_LEN)
      : undefined;
  const address = fsqAddressString(place);

  const product: ProviderProduct = {
    id: `fsq:${fsqId}`,
    provider: "fsq",
    providerProductId: fsqId,
    type,
    ...(subcategory ? { subcategory } : {}),
    title,
    ...(address ? { address } : {}),
    // geo: TOČNA lokacija iz vira (geoPrecision exact — odprti podatki
    // krajev nosijo dejansko lego objekta, NE center mesta).
    lat: place.latitude,
    lng: place.longitude,
    geoPrecision: "exact",
    // NAMERNO brez slike + imageCredit: množica slik NE vsebuje — ne
    // hotlinkamo tujih lastnin (licenčna čistost, audit 42 točka 12).
    ...(hasRating
      ? {
          rating: Math.round(statsRating * 100) / 100,
          ...(hasReviewCount ? { reviewCount: statsCount as number } : {}),
        }
      : {}),
    // NAMERNO brez cene: odprti podatki krajev cene NE vsebujejo.
    // NAMERNO brez availability: vir koncepta nima (odsotno polje =
    // dokumentirana semantika not_supported).
    bookingMode: "info_only" as const,
    // NAMERNO brez bookingUrl: info_only vir — pot do kraja je
    // sourceUrl/phone, ne rezervacija.
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(openingHours ? { openingHours } : {}),
    ...(phone ? { phone } : {}),
    lastUpdated: ctx.lastUpdated,
    license: {
      source: "Foursquare Open Places (OS Places)",
      attribution: "© Foursquare / Open Places Apache-2.0",
    },
  };

  return product;
}

/**
 * Preslikaj seznam krajev (fail-safe: slab zapis odpade + števec —
 * §22: vsak VHOD preverimo tudi tu, meja adapterja velja za VSAKEGA
 * klicatelja, ne samo adapterjevo pot).
 */
export function mapFsqPlaces(
  places: FsqPlace[],
  ctx: FsqMapperContext | ((place: FsqPlace) => FsqMapperContext)
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const place of places) {
    const c = typeof ctx === "function" ? ctx(place) : ctx;
    const p = mapFsqPlace(place, c);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
