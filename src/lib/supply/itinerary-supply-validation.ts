// ============================================================================
// TASK 47 — SUPPLY REVALIDACIJA AI IZHODA (1.52.0, spec §7/§12/§17)
// ============================================================================
// AI izhod NIKOLI ni zaupan vreden. Veriga (route):
//   AI JSON → sanitizeItinerary (schema) → REVALIDATE (tu) →
//   applyFixedSelectedProducts (FIXED invariant) → enrich → final.
//
// Ta čista funkcija:
//  1. Indeksira ZNANI kanonski supply (uporabnikove izbire ∪ strežni
//     supply kontekst) po "{provider}:{providerProductId}".
//  2. Za vsak AI postanek, ki se SKLICUJE na supply (destination_id v
//     formatu {registriran provider slug}:{id}):
//       - NI v indeksu  → HALUCINACIJA → postanek ODSTRANJEN
//                         (poročilo v dropped[] — NIKOLI silent, NIKOLI
//                         fallback/fake produkt).
//       - JE v indeksu  → REBIND na kanonske vrednosti: naslov, cena
//                         (estimated_cost = kanonski znesek ali 0), geo,
//                         category "supply", notes (deterministično: opis +
//                         „od €X (enota)" + vir + ISKRENA razpoložljivost).
//  3. Vsi ostali postanki (T1 destinacije, chat-dodana OSM mesta
//     „osm-node-…", čisti nizi brez dvopičja) ostanejo NEDOTIKNJENI —
//     obstoječa sanitize pot.
//
// S tem sodokrito: provider (iz registra), providerProductId (iz supplyja),
// cena (iz supplyja, z enoto v notes), razpoložljivost (iz statusa —
// negotovost ostane negotovost). AI sme določati SAMO itinerary semantiko
// (dan, urnik, trajanje, kontekst v notes okrog kanonske jedri).
// ============================================================================

import type { Itinerary, LocationVisit } from "@/lib/types";
import { isProviderSlug } from "./registry";
import { availabilityNote } from "./availability-note";
import type {
  AiSupplyProduct,
} from "./ai-context";
import type {
  AvailabilityStatus,
  BookingMode,
  PriceInfo,
  ProductType,
  ProviderSlug,
  SelectedProviderProduct,
} from "./types";

// ---------------------------------------------------------------------------
// ZNANI SUPPLY INDEKS
// ---------------------------------------------------------------------------

/** Kanonski vstop iz supply sloja (skupna oblika za izbire + kontekst). */
export interface KnownSupplyEntry {
  provider: ProviderSlug;
  providerProductId: string;
  title: string;
  type: ProductType;
  lat?: number;
  lng?: number;
  price?: PriceInfo;
  availability?: { status: AvailabilityStatus };
  /** Ime vira (license.source ?? provider) — za notes/vir. */
  source: string;
  /** Kratek opis (samo iz strežnega konteksta — izbire ga ne nosijo). */
  description?: string;
  /** Za iskreno izpeljavo razpoložljivosti (odsotno + komercialno = „preveri pri ponudniku"). */
  bookingMode: BookingMode;
  selectionState: "fixed" | "preferred" | "suggested";
}

const SUPPLY_REF_RE = /^([a-z][a-z0-9_]*):(.+)$/;

/**
 * Zgradi indeks znanega supplyja: uporabnikove izbire (sanitizirane —
 * meja zaupanja klienta) ∪ strežni supply kontekst (kanonski).
 *
 * Prioriteta pri istem {provider}:{id}: UPORABNIKOVA Izbira (njene cene/
 * naslovi so tisto, kar je uporabnik videl na zemljevidu — eksplicitnejši
 * vir kot strežni kontekst, ki je lahko kapiran na 12 produktov).
 */
export function buildKnownSupplyIndex(
  selections: SelectedProviderProduct[],
  contextProducts: AiSupplyProduct[]
): Map<string, KnownSupplyEntry> {
  const index = new Map<string, KnownSupplyEntry>();
  const key = (p: { provider: ProviderSlug; providerProductId: string }) =>
    `${p.provider}:${p.providerProductId}`;

  // 1) Strežni kanonski kontekst (nižja prioriteta).
  for (const p of contextProducts) {
    index.set(key(p), {
      provider: p.provider,
      providerProductId: p.providerProductId,
      title: p.title,
      type: p.type,
      ...(p.location?.lat != null ? { lat: p.location.lat } : {}),
      ...(p.location?.lng != null ? { lng: p.location.lng } : {}),
      ...(p.price ? { price: p.price } : {}),
      ...(p.availability ? { availability: p.availability } : {}),
      source: p.provider,
      ...(p.description ? { description: p.description } : {}),
      bookingMode: p.bookingMode,
      selectionState: p.selectionState,
    });
  }
  // 2) Uporabnikove izbire PREPIŠEJO kontekst (višja prioriteta).
  // bookingMode: ista izpeljava kot apply-fixed (osm → info_only, sicer
  // komercialno) — enkraten vir resnice za to kompenzirano polje.
  for (const p of selections) {
    index.set(key(p), {
      provider: p.provider,
      providerProductId: p.providerProductId,
      title: p.title,
      type: p.type,
      ...(p.lat != null ? { lat: p.lat } : {}),
      ...(p.lng != null ? { lng: p.lng } : {}),
      ...(p.price ? { price: p.price } : {}),
      ...(p.availability ? { availability: p.availability } : {}),
      source: p.source,
      bookingMode: p.provider === "osm" ? "info_only" : "affiliate_redirect",
      selectionState: p.selectionState,
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// KANONSKA OPOMBA (notes) — deterministična, izključno iz supply sloja
// ---------------------------------------------------------------------------

/** Format cene z enoto (isti vzorec kot insertProductStop — kontinuiteta). */
function canonicalPriceNote(
  price: PriceInfo | undefined,
  lang: "sl" | "en"
): string | undefined {
  if (!price) return undefined;
  const unit = price.unit.replace(/_/g, " ");
  const from = price.fromPrice ? (lang === "en" ? "from " : "od ") : "";
  return lang === "en"
    ? `price: ${from}€${price.amount} (${unit})`
    : `cena: ${from}${price.amount} € (${unit})`;
}

/** Sestavi kanonsko opombo supply postanka (isti duh kot insertProductStop). */
export function canonicalSupplyNotes(
  entry: KnownSupplyEntry,
  lang: "sl" | "en"
): string {
  const parts: string[] = [];
  if (entry.description) parts.push(entry.description.slice(0, 120));
  const price = canonicalPriceNote(entry.price, lang);
  if (price) parts.push(price);
  // ISKRENA razpoložljivost — ista ODVOJENA semantika kot insertProductStop:
  // odsotno pri komercialnem viru = not_supported → „preveri pri ponudniku".
  const avail =
    availabilityNote(entry.availability?.status, lang) ??
    (entry.bookingMode === "affiliate_redirect" ||
    entry.bookingMode === "api_bookable"
      ? availabilityNote("not_supported", lang)
      : undefined);
  if (avail) parts.push(avail);
  parts.push(lang === "en" ? `source: ${entry.source}` : `vir: ${entry.source}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// REVALIDACIJA
// ---------------------------------------------------------------------------

export interface DroppedSupplyRef {
  day: number;
  /** destination_id, ki ga AI izpljunil in ni v znanem supplyju. */
  id: string;
  reason: "unknown-supply-ref";
}

export interface SupplyValidationResult {
  itinerary: Itinerary;
  /** Št. postankov, poboljšanih na kanonske vrednosti. */
  rebound: number;
  /** Halucinirane supply reference (odstranjene — NIKOLI silent). */
  dropped: DroppedSupplyRef[];
}

/**
 * Ali je destination_id SKLIC na supply: format
 * {registriran ProviderSlug}:{neprazen id}. T1 id-ji („bled"), chat OSM
 * mesta („osm-node-123") in vsi ostali formati niso supply reference.
 */
export function isSupplyRef(destinationId: string): boolean {
  const m = SUPPLY_REF_RE.exec(destinationId);
  return m != null && isProviderSlug(m[1]);
}

/**
 * Revalidira AI itinerer proti znanemu supplyju (§17).
 *
 * NE mutira vhoda (vrne nov objekt). Dni brez lokacij po odstranitvi
 * ostanejo strukturno veljavni ( obstoječa sanitize semantika — geo
 * validacija jih pošteno oceni naprej).
 */
export function revalidateSupplyStops(
  it: Itinerary,
  known: Map<string, KnownSupplyEntry>,
  lang: "sl" | "en"
): SupplyValidationResult {
  const dropped: DroppedSupplyRef[] = [];
  let rebound = 0;

  if (!it.days || it.days.length === 0) {
    return { itinerary: it, rebound, dropped };
  }
  // PRAZEN known supply NI izstop: vsak supply sklic je tedaj neizproven
  // (ni izbir, ni konteksta) → halucinacija → drop (§17: nikoli silent).

  const nextDays = it.days.map((d) => {
    const locations: LocationVisit[] = [];
    for (const loc of d.locations) {
      if (!isSupplyRef(loc.destination_id)) {
        locations.push(loc); // ni supply sklic → obstoječa pot (NEDOTIKNJEN)
        continue;
      }
      const entry = known.get(loc.destination_id);
      if (!entry) {
        // HALUCINIRANA supply referenca (provider je registriran, produkt
        // pa ne obstaja v znanem supplyju) → ODSTRANI + poročaj.
        dropped.push({ day: d.day, id: loc.destination_id, reason: "unknown-supply-ref" });
        continue;
      }

      // REBIND na kanonske vrednosti (§5 cena, §6 razpoložljivost, §7 id,
      // geo). AI semantika (dan/urnik/trajanje) se ohrani — to je njen job.
      locations.push({
        ...loc,
        destination_name: entry.title,
        // Cena iz supply sloja — NIKOLI AI številka; brez cene 0 (ne izmišljujemo).
        estimated_cost: entry.price ? Math.round(entry.price.amount) : 0,
        notes: canonicalSupplyNotes(entry, lang),
        category: "supply",
        ...(entry.lat != null ? { lat: entry.lat } : { lat: undefined }),
        ...(entry.lng != null ? { lng: entry.lng } : { lng: undefined }),
      });
      rebound++;
    }
    return { ...d, locations };
  });

  return {
    itinerary: { ...it, days: nextDays },
    rebound,
    dropped,
  };
}
