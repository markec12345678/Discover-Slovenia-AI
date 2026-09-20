// ============================================================================
// TASK 47 — SUPPLY-AWARE AI: KANONSKI SUPPLY KONTEKST ZA AI (1.52.0)
// ============================================================================
// VERIGA: REAL SUPPLY → ProviderProduct → AiSupplyProduct (varna projekcija)
// → AI prompt → validated itinerary.
//
// NAČELA (spec Task 47):
//  - ProviderProduct se NE razširja — tu je SAMO serializacijska projekcija
//    za AI prompt (§3): brez bookingUrl/sourceUrl/image/license (površina za
//    injekcijo ostaja zaprta — isti vzorec kot sanitizeSelectedProviderProducts).
//  - Manjkajoč podatek ostane MANJKAJOČ (AI vidi "-", ne ugiba) — §2.
//  - AI ne pozna provider API-jev: kontekst gradi obstoječi searchSupply()
//    runner (§10) — ta modul NE kliče nobenega providerja direktno.
//  - Cena/razpoložljivost se preneseta KANONSKO (enota, fromPrice, status) —
//    semantika §5/§6 je v promptu izrecna.
//  - Strežniško pridobljeni produkti so SUGGESTED (iskrena privzetost):
//    supply priporočilo NIKOLI ne povozi uporabnikovih zahtev (§14).
//    FIXED/PREFERRED izključno iz uporabnikove izbire (selectedProviderProducts).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ProviderProduct, ProviderSlug } from "./types";
import type { SelectionState, ProductType, PriceInfo, AvailabilityStatus, GeoPrecision, BookingMode } from "./types";
import { searchSupply } from "./search";
import type { SupplyAdapter } from "./adapter";

// ---------------------------------------------------------------------------
// §3 — AiSupplyProduct: VARNA PROJEKCIJA kanonskega ProviderProduct za AI
// ---------------------------------------------------------------------------

/**
 * Projekcija kanonskega produkta v AI kontekst. NI razširitev modela
 * ProviderProduct (spec §2/§3): polja, ki v AI prompt nimajo kaj iskati
 * (bookingUrl, sourceUrl, image, imageCredit, license, phone,
 * openingHours, wikidata…), so NAMENOMA izpuščena.
 */
export interface AiSupplyProduct {
  provider: ProviderSlug;
  providerProductId: string;
  type: ProductType;
  title: string;
  /** Skrajšan opis (≤ 240 znakov, kontrolni znaki odstranjeni). */
  description?: string;
  location?: {
    lat?: number;
    lng?: number;
    geoPrecision?: GeoPrecision;
    address?: string;
  };
  /** KANONSKA struktura (amount/unit/fromPrice — NIKOLI gol €X). */
  price?: PriceInfo;
  /** SAMO status — checkedAt/nota ostajata v supply sloju (§6). */
  availability?: { status: AvailabilityStatus };
  rating?: number;
  reviewCount?: number;
  bookingMode: BookingMode;
  /** FIXED (uporabnikova izbira) / PREFERRED / SUGGESTED (strežni supply). */
  selectionState: SelectionState;
}

/** Kap supply konteksta za AI (token proračun prompta pod nadzorom). */
export const MAX_AI_SUPPLY_PRODUCTS = 12;

/** Kategorije AI supply konteksta: komercialna ponudba (transfer/aktivnost/tura).
 *  OSM lokalni vir je cat-gated pri teh kategorijah (0 klicev na Overpass —
 *  lokalne POI točke za AI pokriva T1 destinacijski dataset v destContext). */
export const AI_SUPPLY_CATS: ProductType[] = ["transfer", "activity", "tour"];

/** Očisti prosti tekst projekcije (obramba v globini: adapterji že čistijo). */
function cleanText(v: string | undefined, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, max) : undefined;
}

/**
 * ProviderProduct → AiSupplyProduct (varna projekcija za AI).
 * Default selectionState = "suggested" (strežni supply — §14 poštenost).
 */
export function toAiSupplyProduct(
  p: ProviderProduct,
  selectionState: SelectionState = "suggested"
): AiSupplyProduct {
  const location: AiSupplyProduct["location"] =
    p.lat != null || p.lng != null || p.geoPrecision != null || p.address != null
      ? {
          ...(p.lat != null ? { lat: p.lat } : {}),
          ...(p.lng != null ? { lng: p.lng } : {}),
          ...(p.geoPrecision != null ? { geoPrecision: p.geoPrecision } : {}),
          ...(p.address != null ? { address: p.address } : {}),
        }
      : undefined;

  const description = cleanText(p.description, 240);

  return {
    provider: p.provider,
    providerProductId: p.providerProductId,
    type: p.type,
    title: p.title.slice(0, 120),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(p.price ? { price: p.price } : {}),
    ...(p.availability ? { availability: { status: p.availability.status } } : {}),
    ...(p.rating != null ? { rating: p.rating } : {}),
    ...(p.reviewCount != null ? { reviewCount: p.reviewCount } : {}),
    bookingMode: p.bookingMode,
    // NAMENOMA brez: bookingUrl, sourceUrl, image, imageCredit, license,
    // phone, openingHours, wikidata, wikipedia, cuisine, altSources, id,
    // subcategory, lastUpdated — AI jih ne potrebuje, injekcijska površina
    // ostaja zaprta (spec §8: AI kontekst brez URL-jev).
    selectionState,
  };
}

// ---------------------------------------------------------------------------
// §10 — STREŽNI SUPPLY ISKALNIK ZA AI (obstoječi searchSupply, NI drugega)
// ---------------------------------------------------------------------------

/**
 * Bbox Slovenije izpeljan IZ SLOVENSKIH destinacij (naš enkraten vir
 * resnosti — brez hardcodanih magičnih števil) + blazena obroba 0.15°.
 * Površina ~4 deg² — pod mejo z10 (36 deg²) v maxBboxAreaForZoom.
 *
 * TASK 62: register je razširjen na SI+HR+ME+AL, a je ta bbox namenoma
 * OSTAL slovenski — AI supply kontekst (transferji KT) pokriva slovensko
 * ponudbo; regionalna potovanja uporabljajo journey planner, ki poizveduje
 * bbox-okoli-destinacije (orchestrator localCategories). Regijska širitev
 * registra tu NE pomeni širjenja iskanja (iskrenost namena).
 */
export function aiSupplyBboxFromDestinations(): [
  number,
  number,
  number,
  number,
] {
  let minLat = 90;
  let minLng = 180;
  let maxLat = -90;
  let maxLng = -180;
  for (const d of DESTINATIONS) {
    if (d.country !== "SI") continue; // TASK 62: samo slovenske koordinate
    minLat = Math.min(minLat, d.coords.lat);
    maxLat = Math.max(maxLat, d.coords.lat);
    minLng = Math.min(minLng, d.coords.lng);
    maxLng = Math.max(maxLng, d.coords.lng);
  }
  const pad = 0.15;
  return [
    Math.max(-90, minLat - pad),
    Math.max(-180, minLng - pad),
    Math.min(90, maxLat + pad),
    Math.min(180, maxLng + pad),
  ];
}

export interface AiSupplyContextResult {
  /** Projekcije kanonskih produktov (cap MAX_AI_SUPPLY_PRODUCTS). */
  products: AiSupplyProduct[];
  /** Providerji, ki so DEJANSKO prispevali ≥ 1 produkt (iskrena telemetrija). */
  providers: ProviderSlug[];
  /** Padli adapterji (kontekst ostane delno uporaben — graceful degradation). */
  degraded: ProviderSlug[];
  /** Skupno št. produktov pred kapom (iskrenost o obsegu). */
  total: number;
}

/**
 * Strežni supply kontekst za AI (§10): POKLIČE OBSTOJEČI searchSupply runner
 * z državnim bboxom + komercialnimi kategorijami. Ta modul NE pozna nobenega
 * provider API-ja (edini odhodni klici so v adapterjih).
 *
 * - OSM: cat-gated (njegovi tipi ne vključujejo transfer/activity/tour)
 *   → 0 klicev na Overpass.
 * - KiwiTaxi: LIVE dataset v pomnilniku (2 ms).
 * - Viator/GetYourGuide: runtime capability gate — brez žetona iskreno
 *   prazno (0 klicev na vir, NIKOLI fake inventar).
 *
 * NIKOLI ne vrže (odpoved supply → prazen kontekst; generacija itinererja
 * ostane živa — isto načelo kot ranking engine).
 */
export async function fetchAiSupplyContext(
  opts: {
    pax?: number;
    date?: string;
    locale: "sl" | "en";
    /** Testi vbrizgajo adapterje; produkcija dobi privzete (realne). */
    adapters?: SupplyAdapter[];
  }
): Promise<AiSupplyContextResult> {
  try {
    const response = await searchSupply(
      {
        bbox: aiSupplyBboxFromDestinations(),
        zoom: 10, // ≥ minZoom vseh komercialnih adapterjev; OSM cat-gated
        cats: AI_SUPPLY_CATS,
        ...(opts.pax != null ? { pax: opts.pax } : {}),
        ...(opts.date != null ? { date: opts.date } : {}),
        locale: opts.locale,
      },
      opts.adapters
    );

    const total = response.products.length;
    const capped = response.products.slice(0, MAX_AI_SUPPLY_PRODUCTS);
    const providers = [...new Set(capped.map((p) => p.provider))];
    return {
      products: capped.map((p) => toAiSupplyProduct(p, "suggested")),
      providers,
      degraded: response.degraded,
      total,
    };
  } catch {
    // Supply odpoved NIKOLI ne podre generacije itinererja (§10).
    return { products: [], providers: [], degraded: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// §4–§6, §14 — AI PROMPT BLOK (strukturirana ponudba + izrecna pravila)
// ---------------------------------------------------------------------------

function fmtPrice(p: PriceInfo | undefined, lang: "sl" | "en"): string {
  if (!p) return "-";
  const unit = p.unit.replace(/_/g, " ");
  return p.fromPrice
    ? lang === "en"
      ? `from €${p.amount} (${unit})`
      : `od ${p.amount} € (${unit})`
    : `€${p.amount} (${unit})`;
}

function fmtAvailability(
  a: { status: AvailabilityStatus } | undefined,
  lang: "sl" | "en"
): string {
  switch (a?.status) {
    case "live_available":
      return lang === "en" ? "LIVE available" : "ŽIVO na voljo";
    case "live_unavailable":
      return lang === "en" ? "LIVE unavailable" : "ŽIVO ni na voljo";
    case "unknown":
      return "unknown";
    case "not_supported":
      return lang === "en" ? "no availability data at source" : "vir nima podatka o razpoložljivosti";
    default:
      return "";
  }
}

/**
 * Zgradi strukturiran blok AI supply konteksta (SL/EN). Prazna ponudba →
 * prazen blok (ni spremembe obnašanja brez supplyja).
 *
 * Pravila v bloku (izrecna, spec §4–§6/§14):
 *  - [SUGGESTED]/[PREFERRED] semantika (FIXED prihaja iz uporabnikove
 *    izbire — obstoječi buildSelectedProductsContext blok).
 *  - cena je STRUCTURED (enota + „od") — per_transfer NI per_person;
 *  - razpoložljivost je LOČENA od cene — unknown ostane unknown;
 *  - provider/id IMMUTABLE — destination_id točno kot podan;
 *  - prioritetna lestvica: uporabnikove trde zahteve > supply predlogi.
 */
export function buildAiSupplyContext(
  products: AiSupplyProduct[],
  lang: "sl" | "en"
): string {
  if (products.length === 0) return "";

  const lines = products.map((p, i) => {
    const geo =
      p.location?.lat != null && p.location?.lng != null
        ? `lat=${p.location.lat.toFixed(5)}, lng=${p.location.lng.toFixed(5)}`
        : p.location?.address || "no-geo";
    const rating =
      p.rating != null
        ? `, rating: ${p.rating}${p.reviewCount != null ? ` (${p.reviewCount} reviews)` : ""}`
        : "";
    const avail = p.availability
      ? `, availability: ${fmtAvailability(p.availability, lang)}`
      : "";
    const desc = p.description ? ` — ${p.description}` : "";
    return `${i + 1}. [${p.selectionState.toUpperCase()}] ${p.title}${desc} — provider: ${p.provider}, id: ${p.providerProductId}, type: ${p.type}, geo: ${geo}, price: ${fmtPrice(p.price, lang)}, bookingMode: ${p.bookingMode}${rating}${avail}`;
  });

  if (lang === "en") {
    return `
AVAILABLE SUPPLY FROM PARTNER PROVIDERS (canonical structured supply — real products, NOT text):
${lines.join("\n")}

SUPPLY SEMANTICS (MANDATORY):
- [SUGGESTED] products: include ONLY if they genuinely fit the traveler's interests, pace and budget. You may decline any of them — supply never overrides the traveler's hard requirements (budget, dates, pace, chosen destinations).
- [PREFERRED] products: include when they fit; decline only for a real conflict (time, location, date, duration, user constraint) and state the reason in notes.
- PRIORITY LADDER (never inverted): safety and the traveler's hard constraints > FIXED user selections > date/time/location constraints > PREFERRED > SUGGESTED > your own creativity.
- PRICE IS STRUCTURED DATA: the unit is part of the price. "€51 (per transfer)" means the whole vehicle transfer costs €51 — NEVER present it as "€51 per person". "from €X" is a published lower bound, NEVER a confirmed price. Do not invent, recalculate or restate prices without their unit.
- AVAILABILITY IS SEPARATE FROM PRICE: "unknown" means availability was NOT verified — never claim a product is "available for your date". "no availability data at source" means the source has no availability concept — say "confirm with the provider". Only "LIVE available" may be stated as availability.
- PROVIDER ID IS IMMUTABLE: to include a supply product as a stop, set destination_id EXACTLY to "{provider}:{id}" from the list above (e.g. "${"{provider}:{id}"}"), keep its title, and mention provider + price with unit in notes. NEVER invent provider ids, provider names, prices or availability — a supply stop that does not exist in the lists above will be REMOVED by server-side validation.
- transfer = transport constraint (airport/station pickup structures the day's timing, it is not a sightseeing stop); activity/tour = bookable experience (respect dates and typical durations).
`;
  }
  return `
RAZPOLOŽLJIVA PONUDBA PARTNERSKIH PROVIDERJEV (kanonska strukturirana ponudba — realni produkti, NE tekst):
${lines.join("\n")}

SEMANTIKA PONUDBE (OBVEZNO):
- [SUGGESTED] produkti: vključi SAMO, če resnično ustrezajo interesom, tempu in proračunu potnika. Vsakega lahko zavrneš — ponudba NIKOLI ne povozi trdih zahtev potnika (proračun, datumi, tempo, izbrane destinacije).
- [PREFERRED] produkti: vključi, kadar ustrezajo; zavrneš samo zaradi realnega konflikta (čas, lokacija, datum, trajanje, uporabnikova omejitev) in razlog navedi v notes.
- PRIORITETNA LESTVICA (nikoli obrnjena): varnost in trde zahteve potnika > FIXED izbire uporabnika > omejitve datuma/časa/lokacije > PREFERRED > SUGGESTED > lastna kreativnost.
- CENA JE STRUCTURED PODATEK: enota je del cene. „€51 (per transfer)" pomeni, da celoten prevoz (vozilo) stane €51 — NIKOLI ne predstavi kot „€51 na osebo". „od €X" je objavljena spodnja meja, NIKOLI potrjena cena. Ne izmišljuj, ne preračunavaj in ne navajaj cen brez enote.
- RAZPOLOŽLJIVOST JE LOČENA OD CENE: „unknown" pomeni, da razpoložljivost NI bila preverjena — NIKOLI ne trdi, da je produkt „na voljo za tvoj datum". „vir nima podatka o razpoložljivosti" pomeni, da vir koncepta nima — reci „preveri pri ponudniku". Samo „ŽIVO na voljo" sme biti izraženo kot razpoložljivost.
- PROVIDER ID JE IMMUTABLE: za vključitev supply produkta kot postanka nastavi destination_id NATANČNO na „{provider}:{id}" s seznama zgoraj, obdrži njegov naslov ter v notes omeni ponudnika + ceno z enoto. NIKOLI ne izmišljuj provider id-jev, imen providerjev, cen ali razpoložljivosti — supply postanek, ki ne obstaja v seznamih zgoraj, bo strežniška validacija ODSTRANILA.
- transfer = transportna omejitev (prevzem z letališča/postaje strukturira urnik dneva, ni zanimivost); activity/tour = rezervabilna izkušnja (spoštuj datume in značilna trajanja).
`;
}

// ---------------------------------------------------------------------------
// §21 — FINGERPRINT SUPPLY KONTEKSTA (cache identiteta, če se AI cache uvede)
// ---------------------------------------------------------------------------

/** FNV-1a (32-bit) — deterministično, brez odvisnosti. */
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function priceFingerprintPart(p: PriceInfo | undefined): string {
  if (!p) return "-";
  return `${p.amount}|${p.currency}|${p.unit}|${p.fromPrice === true ? 1 : 0}`;
}

/**
 * Determinističen prstni odtip kanonskega supply konteksta (§21).
 *
 * NAMEN: če se AI odgovor kdaj predpomni, MORA biti ta odtip del cache
 * identitete — request A (supply=A) in request B (supply=B) se NIKOLI ne
 * smeta deliti predpomnjenega itinererja. Vhod so projekcije BREZ URL-jev
 * in skrivnosti (provider žetoni se v odtis NIKOLI ne zapišejo).
 *
 * Upošteva: provider, id, tip, naslov, ceno (znesek+enota+fromPrice),
 * razpoložljivost, selectionState, geo (5 decimalk) — torej VSE, kar AI
 * dejansko vidi in kar vpliva na izhod.
 */
export function supplyContextFingerprint(
  products: AiSupplyProduct[]
): string {
  const parts = products
    .map((p) =>
      [
        p.provider,
        p.providerProductId,
        p.type,
        p.title,
        priceFingerprintPart(p.price),
        p.availability?.status ?? "-",
        p.selectionState,
        p.location?.lat != null ? p.location.lat.toFixed(5) : "-",
        p.location?.lng != null ? p.location.lng.toFixed(5) : "-",
      ].join("~")
    )
    .sort(); // vrstni red ne sme vplivati na identiteto vsebine
  const joined = parts.join("\n");
  // Dvojni FNV (različna semena) → 64-bit ekvivalenten hex kolizijski prostor.
  return `${fnv1a(joined).toString(16).padStart(8, "0")}${fnv1a(joined, 0x9dc5811c).toString(16).padStart(8, "0")}`;
}
