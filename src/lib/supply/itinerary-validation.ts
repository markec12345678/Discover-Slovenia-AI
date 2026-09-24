// ============================================================================
// TASK 48 — ITINERARY REALISM: SUPPLY CONSISTENCY VALIDATION LAYER (1.53.0)
// ============================================================================
// DETERMINISTIČNA, ČISTA plast nad AI izhodom (generacija + refine + fallback),
// ki itinererju dokazuje supply-doslednost, preden gre k uporabniku:
//
//   1. SUPPLY REFERENCE  — vsak postanek z destination_id v kolon-formatu
//      ("provider:providerProductId", npr. "kiwitaxi:123") se preveri proti
//      KANONSKI avtoriteti (izbira z zemljevida ∪ obstoječi postanki pred
//      refine). Izmišljen ID → ODSTRANJEN (fail-closed, Task 47 §7: neznan
//      ID se NIKOLI ne sprejme tiho).
//   2. DUPLICATE SUPPLY  — isti provider+providerProductId največ 1× v celem
//      načrtu (KiwiTaxi:123 dvakrat → 1; KiwiTaxi:123 + Viator:123 = 2
//      RAZLIČNA produkta — dedupe SAMO po (provider, id), nikoli po naslovu).
//   3. PRICE CONSISTENCY — estimated_cost supply postanka mora biti kanonsko
//      izračunan iz PriceInfo + unit semantike (audit 42, točka 10):
//        per_transfer / per_vehicle / total → znesek (NIKOLI × osebe)
//        per_person                         → znesek × groupSize (če je znan)
//        per_night / per_day                → UNKNOWN (ne ugibamo nočitev)
//      Odstopanje → popravek na kanonsko vrednost + issue (kanonski supply
//      JE avtoriteta). Kanonsko neznan → brez popravka (unknown is unknown).
//   4. GEO CANONICAL     — koordinate supply postanka se obnovijo iz kanonske
//      izbire, če jih je AI odmev premaknil (cena/geo sta jeziku neodvisna).
//   5. TRANSFER DIRECTION — odmev, ki OBRNE smer prevoza v naslovu ("Bled →
//      Ljubljana" namesto "Ljubljana → Bled"), se popravi na kanonski naslov
//      (§5: kanonski supply je avtoriteta smeri). Ozko, deterministično
//      pravilo — ZAMOLČI, kadar smeri ni mogoče dokazati (brez false
//      positives na kvalifikatorjih, npr. "Airport").
//   6. FIXED INVARIANT   — FIXED izbire (z geo, ne-nastanitev), ki jih AI ni
//      vključil, se deterministično vnesejo (ista mehanika insertProductStop
//      kot Task 47 — najbližji dan, večernji slot). AI NIKOLI ne izniči
//      uporabnikove eksplicitne izbire. Ob refine se vnesejo SAMO tiste,
//      ki so bile ŽE v načrtu pred spremembo (refine ne vsiljuje novih
//      postankov, ki jih trenutni načrt nima — to je delo generacije).
//   7. BUDGET VALIDATION — status proračuna iz ZNANIH stroškov:
//        exceeded  → znani kanonski stroški > budget (dokazljivo čez)
//        within     → kanonski IN prikazani seštevek ≤ budget IN vsi
//                     postanki cenovno znani IN nobena cena ni "od"
//        uncertain  → sicer (unknown cene / fromPrice / prikazana vsota
//                     nad proračunom — §12: nikoli "within" brez dokaza)
//
// NAČELA:
//  - NOVIH remote klicev NI (§19): validacija je 100% lokalna/deterministična
//    nad že pridobljenimi kanonskimi podatki (izbira / T1 dataset).
//  - UNKNOWN IS UNKNOWN (§8): kjer kanonske cene ni, je ni — ne izmišljujemo.
//  - Kolon-format JE diskriminator supply refa: T1 id-ji ("bled") in klepet
//    kraji ("osm-node-123") dvopičja nimajo; supply id ("osm:node-123") ga ima.
//  - AVTORITETA (prioriteta): izbira z zemljevida (PriceInfo z unit semantiko
//    + fromPrice) → obstoječi postanek pred spremembo (refine pot: prikazana
//    vrednost je izhodišče, ki ga AI odmev ne sme tiho spremeniti).
//  - Čista funkcija (server + client uporabna, brez db/uvozov s skrivnostmi).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import { recomputeTotalBudget } from "@/lib/itinerary-quality";
import { isProviderSlug } from "./registry";
import { insertProductStop } from "./stop-insert";
import { verifyCurrentStopsAuthority } from "./selection-verify";
import type {
  PriceInfo,
  ProviderSlug,
  SelectedProviderProduct,
} from "./types";

// HARDENING I4/P-3: odprti krajevni viri (info_only) — €0 je dolgoletna
// poštena konvencija (brezplačen obisk odprte točke), ne izmišljena vrednost.
// Komercialni providerji (affiliate_redirect/api_bookable) brez strežno
// dokazljive cene → unknown (NaN + opomba), NIKOLI €0 ali AI-jeva cifra.
import type { Itinerary, LocationVisit } from "@/lib/types";

// HARDENING I4/P-3: odprti krajevni viri (info_only) — €0 je dolgoletna
// poštena konvencija (brezplačen obisk odprte točke), ne izmišljena vrednost.
// Komercialni providerji (affiliate_redirect/api_bookable) brez strežno
// dokazljive cene → unknown (NaN + opomba), NIKOLI €0 ali AI-jeva cifra.
const INFO_ONLY_PROVIDERS = new Set(["osm", "fsq", "sto", "events"]);

// ---------------------------------------------------------------------------
// SUPPLY REF — kolon-format (provider:providerProductId)
// ---------------------------------------------------------------------------

export interface SupplyRef {
  provider: ProviderSlug;
  providerProductId: string;
}

const SUPPLY_REF_RE = /^([a-z]+):([\w.-]{1,80})$/;

/**
 * Parsira supply referenco iz destination_id postanka.
 * Vrne null za T1 id-je ("bled"), klepet kraje ("osm-node-123" — brez
 * dvopičja) in neznane ponudnike ("fake:123" ni v registru).
 */
export function parseSupplyRef(destinationId: unknown): SupplyRef | null {
  if (typeof destinationId !== "string") return null;
  const m = destinationId.match(SUPPLY_REF_RE);
  if (!m) return null;
  if (!isProviderSlug(m[1])) return null;
  return { provider: m[1], providerProductId: m[2] };
}

/** Kanonski ključ supply refa — "${provider}:${providerProductId}". */
export function supplyRefKey(
  ref: SupplyRef | { provider: ProviderSlug | string; providerProductId: string }
): string {
  return `${ref.provider}:${ref.providerProductId}`;
}

// ---------------------------------------------------------------------------
// ISSUE #4 §3 (val 1): PRODUKTNO-SPECIFIČNA /go POVEZAVA POSTANKA
// ---------------------------------------------------------------------------
// Produktno-specifični komercialni ponudniki z DETERMINISTIČNO povezavo
// (točno format, ki ga gradijo adapterji — /go/{provider}?product={id};
// /go ruta strežniško validira produktne parametre + host allowlist).
// Viri z DODATNIMI parametri (transfers/from, hotels/dest, flights/dest) in
// tiqets (ID ne gre v URL) NE dobijo povezave tukaj — njihova rezervacijska
// pot ostaja booking panel (K-14 pošteni CTA-ji), ki ima polne parametre.
// S tem življenjski cikel "Brez rezervacije → EXTERNAL" na časovnici AI
// načrta nosi KONKRETEN izdelek tudi na strežniški (AI) poti — ne le na
// klientni (zemljevid → V načrt) poti (stop-insert.ts, isti pogoji).
// ---------------------------------------------------------------------------

const PRODUCT_GO_PROVIDERS: ReadonlySet<string> = new Set([
  "viator",
  "getyourguide",
]);

/** Deterministična produktna /go povezava (ali null, če ponudnik ni
 *  produktno-specifičen). ISTA oblika kot adapterjev mapper — /go ruta je
 *  edina avtoriteta za sprejem produkt parametrov. */
export function productGoUrl(
  provider: string,
  providerProductId: string
): string | null {
  if (!PRODUCT_GO_PROVIDERS.has(provider)) return null;
  return `/go/${provider}?product=${encodeURIComponent(providerProductId)}`;
}

// ---------------------------------------------------------------------------
// KANONSKA CENA POSTANKA — unit semantika (§7)
// ---------------------------------------------------------------------------

/** Kanonski strošek + dokazljivost (fromPrice = spodnja meja, ne citat). */
export interface CanonicalCost {
  cost: number;
  /** Cena je "od" (spodnja meja) → končnega zneska NE dokaže (§12). */
  fromPrice: boolean;
}

/**
 * Kanonski strošek supply postanka za znano skupino.
 *  - per_transfer / per_vehicle / total → znesek (prenos NI odvisen od
 *    števila potnikov — €51 × 2 osebi je NAPAČNO za per_transfer)
 *  - per_person → znesek × groupSize (party size je znan → upoštevamo)
 *  - per_night / per_day → null (število nočitev/dni postanka ne poznamo —
 *    unknown is unknown, §8)
 * Vrne null, kadar cene ali semantike ni mogoče dokazati.
 */
export function canonicalStopCost(
  price: PriceInfo | undefined,
  groupSize?: number
): number | null {
  if (!price || typeof price.amount !== "number" || !Number.isFinite(price.amount)) {
    return null;
  }
  switch (price.unit) {
    case "total":
    case "per_transfer":
    case "per_vehicle":
      return Math.round(price.amount);
    case "per_person": {
      if (
        typeof groupSize === "number" &&
        Number.isFinite(groupSize) &&
        groupSize >= 1 &&
        Number.isInteger(groupSize)
      ) {
        return Math.round(price.amount * groupSize);
      }
      return null; // party size neznan → ne ugibamo
    }
    default:
      return null; // per_night / per_day — neznano št. enot
  }
}

/** Kanonski strošek z dokazljivostjo (fromPrice zastavica iz vira). */
function canonicalCostOf(
  price: PriceInfo | undefined,
  groupSize?: number
): CanonicalCost | null {
  const cost = canonicalStopCost(price, groupSize);
  if (cost == null) return null;
  return { cost, fromPrice: Boolean(price?.fromPrice) };
}

// ---------------------------------------------------------------------------
// TRANSFER DIRECTION (§5) — ozko, deterministično pravilo obrata smeri
// ---------------------------------------------------------------------------

/** Besede, ki NISO kraji (kvalifikatorji naslovov prevozov). */
const TITLE_STOPWORDS = new Set([
  "private",
  "transfer",
  "taxi",
  "shuttle",
  "prenos",
  "prevoz",
  "zasebni",
  "from",
  "to",
  "od",
  "do",
  "and",
  "in",
  "via",
  "airport",
  "letališče",
  "station",
  "postaja",
]);

/** Razdeli naslov prevoza na [levo, desno] stran puščice (ali null). */
function arrowParts(title: string): [string, string] | null {
  if (typeof title !== "string") return null;
  const m = title.match(/(.+?)\s*(?:→|->|⇒)\s*(.+)/);
  if (!m) return null;
  return [m[1], m[2]];
}

/** Žetoni krajev ene strani (male črke, brez oklepajev/besed-kvalifikatorjev). */
function placeTokens(side: string): Set<string> {
  return new Set(
    side
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w))
  );
}

/**
 * Ali odmev OBRNE smer kanonskega prevoza.
 * Ozko pravilo: obe strani puščice morajo biti dokazljivi (žetoni krajev
 * kanonske strani ⊆ žetoni odmeva). Kvalifikatorje ("Airport", "Private")
 * ignorira; kadar smeri NI mogoče dokazati → false (nikoli false positive).
 */
export function isDirectionReversed(canonicalTitle: string, echoName: string): boolean {
  const c = arrowParts(canonicalTitle);
  const e = arrowParts(echoName);
  if (!c || !e) return false;

  const [cl, cr] = c;
  const [el, er] = e;
  const clT = placeTokens(cl);
  const crT = placeTokens(cr);
  const elT = placeTokens(el);
  const erT = placeTokens(er);
  if (clT.size === 0 || crT.size === 0) return false; // ni dokazljivih krajev

  const subset = (a: Set<string>, b: Set<string>) => {
    for (const t of a) if (!b.has(t)) return false;
    return true;
  };

  // Ista smer (kanon L→R se ujema z odmevom L→R) → ni obrat.
  if (subset(clT, elT) && subset(crT, erT)) return false;
  // Obrat (kanon L→R se ujema z odmevom R→L) → popravi na kanon.
  return subset(clT, erT) && subset(crT, elT);
}

// ---------------------------------------------------------------------------
// BUDGET VALIDATION (§12) — status iz ZNANIH stroškov
// ---------------------------------------------------------------------------

export type BudgetStatus = "within" | "exceeded" | "uncertain";

export interface BudgetValidation {
  status: BudgetStatus;
  /** Uporabnikov proračun (EUR), če je znan. */
  budget: number | null;
  /** Seštevek stroškov postankov z dokazljivo (kanonsko) ceno. */
  knownTotal: number;
  /** Seštevek estimated_cost vseh postankov (prikazna številka načrta). */
  stopsTotal: number;
  /** Št. postankov z "od" ceno (spodnja meja — končnega zneska ne dokaže). */
  fromPriceCount: number;
  /** Št. postankov brez dokazljive cene (OSM info_only, unknown semantika). */
  unknownCostStops: number;
}

/**
 * Deterministični status proračuna. Kanonska cena je dokazljiva za:
 *  - supply postanke z veljavno PriceInfo in znano unit semantiko
 *  - T1 postanke (naš uredniški dataset: costPerPerson × groupSize)
 * Vse ostalo (klepet kraji, supply brez cene, per_person brez groupSize,
 * per_night …) šteje kot unknown. "within" ZAHTEVA, da so VSE cene znane,
 * da ni nobene "od" cene IN da je tudi prikazani seštevek znotraj — sicer
 * "uncertain" (§12: ne trdimo "znotraj", česar ne moremo dokazati).
 */
export function computeBudgetValidation(
  itinerary: Itinerary,
  opts: {
    budget?: number;
    groupSize?: number;
    /** Kanonski zneski supply postankov (refKey → canonical), že izračunani
     *  v validateItinerarySupply — ponovna uporaba brez drugega pregleda. */
    canonicalCosts?: Map<string, CanonicalCost>;
  }
): BudgetValidation {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const groupSize =
    typeof opts.groupSize === "number" && opts.groupSize >= 1
      ? Math.round(opts.groupSize)
      : undefined;

  let stopsTotal = 0;
  let knownTotal = 0;
  let fromPriceCount = 0;
  let unknownCostStops = 0;

  for (const day of days) {
    for (const stop of day.locations ?? []) {
      stopsTotal += Number.isFinite(stop.estimated_cost) ? stop.estimated_cost : 0;

      // 1) Supply postanek — kanonski strošek iz validacijskega sloja
      const ref = parseSupplyRef(stop.destination_id);
      if (ref) {
        const canonical = opts.canonicalCosts?.get(supplyRefKey(ref));
        if (canonical) {
          knownTotal += canonical.cost;
          if (canonical.fromPrice) fromPriceCount++;
          continue;
        }
        unknownCostStops++;
        continue;
      }

      // 2) T1 postanek — uredniška kanonska cena (costPerPerson × groupSize)
      const dest = DESTINATIONS.find((d) => d.id === stop.destination_id);
      if (dest && groupSize) {
        knownTotal += Math.round(dest.costPerPerson * groupSize);
        continue;
      }
      // T1 brez groupSize: costPerPerson na osebo je znan kanonično za eno
      // osebo — za skupino ni dokazljiv → unknown (iskreno).
      unknownCostStops++;
    }
  }

  const budget =
    typeof opts.budget === "number" &&
    Number.isFinite(opts.budget) &&
    opts.budget > 0
      ? opts.budget
      : null;

  let status: BudgetStatus;
  if (budget === null) {
    status = "uncertain"; // brez uporabnikovega proračuna ni primerjave
  } else if (knownTotal > budget) {
    status = "exceeded"; // celo spodnja meja znanih stroškov je čez
  } else if (stopsTotal > budget) {
    // Prikazani seštevek načrta je čez — "znotraj" ne moremo trditi, čeprav
    // kanonski zneski (spodnja meja) še spravljajo (§12: pošten do obeh števk).
    status = "uncertain";
  } else if (unknownCostStops === 0 && fromPriceCount === 0) {
    status = "within";
  } else {
    status = "uncertain";
  }

  return {
    status,
    budget,
    knownTotal,
    stopsTotal,
    fromPriceCount,
    unknownCostStops,
  };
}

// ---------------------------------------------------------------------------
// GLAVNA PLAST — validateItinerarySupply
// ---------------------------------------------------------------------------

export type SupplyIssueLevel = "warn" | "error";

export type SupplyRuleId =
  | "fake_supply_ref" // kolon-ref, ki ni v kanonski avtoriteti → odstranjen
  | "duplicate_supply" // isti provider+id dvakrat → dedupe
  | "price_mismatch" // estimated_cost ≠ kanonski → popravljen
  | "price_unverified" // TASK 50: vir cene ni strežniško verificirljiv → unknown
  | "geo_drift" // koordinate odmeva ≠ kanonske → obnovljene
  | "direction_reversed" // odmev obrne smer prevoza → naslov obnovljen
  | "fixed_reinserted"; // FIXED izbira, ki jo AI izpusti → vnese

export interface SupplyValidationIssue {
  day: number;
  level: SupplyIssueLevel;
  rule: SupplyRuleId;
  /** Strojno berljivo ime postanka/refa (lokalizacijo dela UI/plast nad tem). */
  ref: string;
}

export interface SupplyValidationReport {
  /** Vseh supply postankov (kolon-format) v VHODNEM itinererju. */
  supplyStops: number;
  /** Ref-ov, uspešno rešenih proti kanonski avtoriteti. */
  validated: number;
  /** Izmišljenih ref-ov, ODSTRANJENIH (fail-closed). */
  rejected: number;
  /** Podvojenih ref-ov, odstranjenih (isti provider+id). */
  deduped: number;
  /** Popravljenih cen na kanonsko vrednost. */
  priceCorrections: number;
  /** Obnovljenih koordinat iz kanonske izbire. */
  geoRestored: number;
  /** Popravljenih obrnjenih smeri prevozov na kanonski naslov. */
  directionsFixed: number;
  /** Ponovno vstavljenih FIXED izbir (AI jih je izpustil). */
  reinserted: number;
  /** Kanonski zneski po refKey (vhod za computeBudgetValidation). */
  canonicalCosts: Map<string, CanonicalCost>;
  issues: SupplyValidationIssue[];
}

/** Kanonska avtoriteta za supply postanke. */
export interface SupplyAuthority {
  /** Izbrane produkte (z zemljevida) — nosijo PriceInfo/geo/selectionState. */
  selection: SelectedProviderProduct[];
  /**
   * Ohranjeni supply postanki NAČRTA PRED spremembo (refine pot):
   * refKey → postanek. Njihova prikazana cena/koordinate so izhodišče,
   * ki ga AI odmev ne sme tiho spremeniti (avtoriteta drugega reda —
   * selection ima prednost, kjer obstaja).
   */
  currentStops?: Map<string, LocationVisit>;
}

/** Ekstrahira supply postanke iz itinererja (refKey → postanek). */
export function extractSupplyStops(
  itinerary: Itinerary
): Map<string, LocationVisit> {
  const out = new Map<string, LocationVisit>();
  for (const day of itinerary.days ?? []) {
    for (const stop of day.locations ?? []) {
      const ref = parseSupplyRef(stop.destination_id);
      if (!ref) continue;
      const key = supplyRefKey(ref);
      if (!out.has(key)) out.set(key, stop);
    }
  }
  return out;
}

/**
 * VALIDACIJSKA PLAST SUPPLY-DOSLEDNOSTI (čista, deterministična).
 *
 * @param it          itinerer PO schema sanitizaciji (shape guard)
 * @param authority   kanonska avtoriteta: selection (generacija/refine) +
 *                    currentStops (refine — obstoječi postanki pred spremembo)
 * @param opts.lang          jezik (za notes vstavljenih FIXED postankov)
 * @param opts.groupSize     velikost skupine (per_person kanonska cena)
 * @param opts.reinsertFixed ali ponovno vstavimo manjkajoče FIXED izbire
 *                    (generacija/refine-AI: DA; hitre akcije: NE — eksplicitna
 *                    uporabniška transformacija trenutnega načrta)
 * @param opts.reinsertFixedFrom  obseg FIXED ponovne vstavitev:
 *                    "selection" (generacija: vse FIXED iz izbire) |
 *                    "current" (refine: samo FIXED, ki so bile v načrtu
 *                    pred spremembo — refine ne vsiljuje novih postankov)
 */
export function validateItinerarySupply(
  it: Itinerary,
  authority: SupplyAuthority,
  opts: {
    lang: "sl" | "en";
    groupSize?: number;
    reinsertFixed?: boolean;
    reinsertFixedFrom?: "selection" | "current";
  }
): { itinerary: Itinerary; report: SupplyValidationReport } {
  const lang = opts.lang === "en" ? "en" : "sl";
  const reinsertFixed = opts.reinsertFixed !== false; // privzeto DA
  const reinsertFrom = opts.reinsertFixedFrom ?? "selection";

  const report: SupplyValidationReport = {
    supplyStops: 0,
    validated: 0,
    rejected: 0,
    deduped: 0,
    priceCorrections: 0,
    geoRestored: 0,
    directionsFixed: 0,
    reinserted: 0,
    canonicalCosts: new Map(),
    issues: [],
  };

  // Zemljevid kanonskih izbir po refKey (selection)
  const selectionByKey = new Map<string, SelectedProviderProduct>();
  for (const p of authority.selection) {
    selectionByKey.set(supplyRefKey(p), p);
  }
  const currentStops = authority.currentStops ?? new Map<string, LocationVisit>();
  const currentRefKeys = new Set(currentStops.keys());

  // --- 1) REF VALIDACIJA + DEDUPE + CENA + GEO + SMER (en pregled dni) ---
  const seenRefs = new Set<string>();
  const nextDays: Itinerary["days"] = [];

  for (const day of it.days ?? []) {
    const stops: LocationVisit[] = [];
    for (const stop of day.locations ?? []) {
      const ref = parseSupplyRef(stop.destination_id);
      // Ne-supply postanki (T1 / klepet / prazni id-ji) gredo nespremenjeni
      // skozi — ta plast se NE meša v uredniške/klepet postanke.
      if (!ref) {
        stops.push(stop);
        continue;
      }

      report.supplyStops++;
      const key = supplyRefKey(ref);
      const canonical = selectionByKey.get(key);
      const currentStop = currentStops.get(key);

      // 1a) FAKTURA REF: ni v selection NIMI v trenutnih postankih → izmišljen
      // (Task 47 §7: neznan ID → REJECT, NIKOLI tiho sprejet).
      if (!canonical && !currentStop) {
        report.rejected++;
        report.issues.push({
          day: day.day,
          level: "error",
          rule: "fake_supply_ref",
          ref: key,
        });
        continue; // postanek ODSTRANJEN
      }

      // 1b) DUPLICATE: isti provider+id že viden v tem pregledu → dedupe
      // (različna ponudnika z istim id-jem sta RAZLIČNA produkta — key
      // vsebuje providerja, tako da to deluje samo za pravi duplikat).
      if (seenRefs.has(key)) {
        report.deduped++;
        report.issues.push({
          day: day.day,
          level: "error",
          rule: "duplicate_supply",
          ref: key,
        });
        continue; // drugi primerek ODSTRANJEN
      }
      seenRefs.add(key);
      report.validated++;

      let fixedStop = stop;

      // ISSUE #4 §3 (val 1): PRODUKTNO-SPECIFIČEN komercialen postanek →
      // deterministična /go povezava (isti format kot adapter; /go ruta
      // validira parametre). Življenjski cikel na časovnici (žeton
      // "Brez rezervacije" → gumb "Rezerviraj pri ponudniku" → EXTERNAL
      // zapis) ima s tem KONKRETEN izdelek — tudi na AI poti. Samo kadar
      // povezava še NI prisotna (klientna pot jo je morda že dala).
      const stopGoUrl = productGoUrl(ref.provider, ref.providerProductId);
      if (stopGoUrl && !fixedStop.booking_url) {
        fixedStop = {
          ...fixedStop,
          booking_provider: ref.provider,
          booking_product_id: ref.providerProductId,
          booking_url: stopGoUrl,
        };
      }

      // 1c) GEO CANONICAL: koordinate odmeva → kanonske (cena/geo sta
      // jeziku neodvisni; AI premik pina je hallucinacija). Avtoriteta:
      // selection (lastne koordinate produkta) → currentStop (postanek
      // pred spremembo).
      const geoSource =
        canonical &&
        typeof canonical.lat === "number" &&
        typeof canonical.lng === "number" &&
        Number.isFinite(canonical.lat) &&
        Number.isFinite(canonical.lng)
          ? { lat: canonical.lat, lng: canonical.lng }
          : typeof currentStop?.lat === "number" &&
              typeof currentStop?.lng === "number" &&
              Number.isFinite(currentStop.lat) &&
              Number.isFinite(currentStop.lng)
            ? { lat: currentStop.lat, lng: currentStop.lng }
            : null;
      if (geoSource) {
        const drifted = stop.lat !== geoSource.lat || stop.lng !== geoSource.lng;
        if (drifted) {
          fixedStop = { ...fixedStop, lat: geoSource.lat, lng: geoSource.lng };
          report.geoRestored++;
          report.issues.push({
            day: day.day,
            level: "warn",
            rule: "geo_drift",
            ref: key,
          });
        }
      }

      // 1d) TRANSFER DIRECTION (§5): odmev obrne puščico prevoza → naslov
      // obnovimo iz kanonske izbire (smer je del produkta, ne mnenje AI).
      if (
        canonical &&
        typeof stop.destination_name === "string" &&
        typeof canonical.title === "string" &&
        isDirectionReversed(canonical.title, stop.destination_name)
      ) {
        fixedStop = { ...fixedStop, destination_name: canonical.title };
        report.directionsFixed++;
        report.issues.push({
          day: day.day,
          level: "error",
          rule: "direction_reversed",
          ref: key,
        });
      }

      // 1e) PRICE CANONICAL: estimated_cost → kanonsko izračunan (unit
      // semantika + groupSize). Avtoriteta: selection (PriceInfo s semantiko)
      // → currentStop (prikazana vrednost pred spremembo). Kanonsko null →
      // unknown is unknown.
      const canonicalCost =
        canonicalCostOf(canonical?.price, opts.groupSize) ??
        (currentStop && Number.isFinite(currentStop.estimated_cost)
          ? { cost: Math.round(currentStop.estimated_cost), fromPrice: false }
          : null);
      // HARDENING I4/P-3 (generacijska vrzel): avtoriteta pozna produkt, a
      // njegove cene NE MOREMO dokazati ( izbira brez strežne resnice —
      // verifySelectedProducts jo je odstranil) in ni currentStop (generacija,
      // ne refine). Do zdaj je AI-jeva IZMIŠLJENA cena (kljub "price:
      // unknown" v promptu) preživela v izhodu; enako pravilo kot price_
      // unverified veja spodaj: unknown je unknown — NaN + poštena opomba.
      // ODPRTI viri (osm/fsq/sto/events — info_only): €0 je dolgoletna
      // poštena konvencija (brezplačen obisk), izmišljena neničelna
      // vrednost pa je trditev → NaN (ista semantika kot
      // verifyCurrentStopsAuthority za refine pot).
      const infoOnlyProvider = INFO_ONLY_PROVIDERS.has(ref.provider);
      if (!canonicalCost && canonical && canonical.price == null && !infoOnlyProvider) {
        fixedStop = {
          ...fixedStop,
          estimated_cost: Number.NaN,
          notes:
            opts.lang === "en"
              ? "Price not verified — provider is not connected on the server. Check the price and availability with the provider before booking."
              : "Cena ni preverjena — vir ni strežniško priključen. Ceno in razpoložljivost preveri pri ponudniku pred rezervacijo.",
        };
        report.issues.push({
          day: day.day,
          level: "warn",
          rule: "price_unverified",
          ref: key,
        });
      } else if (
        !canonicalCost &&
        canonical &&
        canonical.price == null &&
        infoOnlyProvider &&
        Number.isFinite(fixedStop.estimated_cost) &&
        fixedStop.estimated_cost !== 0
      ) {
        // Odprti vir: AI-jeva neničelna cena je IZUM → unknown.
        fixedStop = { ...fixedStop, estimated_cost: Number.NaN };
        report.issues.push({
          day: day.day,
          level: "warn",
          rule: "price_unverified",
          ref: key,
        });
      }
      if (canonicalCost) {
        report.canonicalCosts.set(key, canonicalCost);
        const current = Number.isFinite(fixedStop.estimated_cost)
          ? fixedStop.estimated_cost
          : 0;
        if (current !== canonicalCost.cost) {
          fixedStop = { ...fixedStop, estimated_cost: canonicalCost.cost };
          report.priceCorrections++;
          report.issues.push({
            day: day.day,
            level: "error",
            rule: "price_mismatch",
            ref: key,
          });
        }
      } else if (
        currentStop &&
        !Number.isFinite(currentStop.estimated_cost)
      ) {
        // TASK 50 (§10, P1 — 1.55.0): postanek JE v trenutnem načrtu (Task 48
        // ga uporabniku ohrani — skrito odstranjevanje ni dovoljeno), a vir
        // cene NI strežniško verificirljiv: verifyCurrentStopsAuthority je
        // že odločil „unknown" (NaN — viator/gyg brez priključitve, KT brez
        // dataseta, OSM z neverificirano netrivialno trditvijo). Do 1.54.0 je
        // klientova cifra (živi dokaz: viator:99999 s €500) ostala kot
        // PRIKAZANA cena v končnem načrtu, budget sloj pa je bil iskren —
        // prikaz in proračun sta si nasprotovala. Zdaj: klientova trditev se
        // pretvori v unknown — estimated_cost NaN (značilke/proračun/JSON
        // serializacija čisti) + poštena opomba, kaj uporabnik sam preveri.
        fixedStop = {
          ...fixedStop,
          estimated_cost: Number.NaN,
          notes:
            opts.lang === "en"
              ? "Price not verified — provider is not connected on the server. Check the price and availability with the provider before booking."
              : "Cena ni preverjena — vir ni strežniško priključen. Ceno in razpoložljivost preveri pri ponudniku pred rezervacijo.",
        };
        report.issues.push({
          day: day.day,
          level: "warn",
          rule: "price_unverified",
          ref: key,
        });
      }

      stops.push(fixedStop);
    }
    nextDays.push({ ...day, locations: stops });
  }

  let result: Itinerary = { ...it, days: nextDays };

  // --- 2) FIXED INVARIANT: manjkajoče FIXED izbire vnese deterministično ---
  // (ista mehanika kot Task 47 applyFixedSelectedProducts — najbližji dan po
  // haversinu, večernji slot, poštena opomba vira; insertProductStop sam
  // deduplikira po id → exactly once garant tudi ob podvojeni izbiri).
  // Refine pot (reinsertFrom "current") vnese SAMO FIXED, ki so bile v
  // načrtu pred spremembo — AI jih ne more tiho zbrisati, refine pa ne
  // vsiljuje novih postankov, ki jih trenutni načrt nima.
  if (reinsertFixed && (it.days ?? []).length > 0) {
    const destCoords = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));
    for (const p of authority.selection) {
      if (p.selectionState !== "fixed") continue;
      if (p.type === "accommodation") continue; // nočitvena baza, ne postanek
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      if (reinsertFrom === "current" && !currentRefKeys.has(supplyRefKey(p))) {
        continue; // ni bila v načrtu pred spremembo → generacija je njena pot
      }
      if (seenRefs.has(supplyRefKey(p))) continue; // že prisoten

      const key = supplyRefKey(p);
      const product = {
        id: key,
        provider: p.provider,
        providerProductId: p.providerProductId,
        type: p.type,
        title: p.title,
        lat: p.lat,
        lng: p.lng,
        price: p.price,
        bookingMode:
          p.provider === "osm" ? ("info_only" as const) : ("affiliate_redirect" as const),
        // ISSUE #4 §3 (val 1): FIXED vstavitev nosi produktno /go povezavo,
        // kadar je ponudnik produktno-specifičen (stop-insert jo prenese
        // v postanek načrta — isti pogoj kot klientna pot).
        ...(productGoUrl(p.provider, p.providerProductId)
          ? {
              bookingUrl:
                productGoUrl(p.provider, p.providerProductId) ?? undefined,
            }
          : {}),
        lastUpdated: new Date().toISOString(),
        license: { source: p.source },
      };
      const inserted = insertProductStop(result, product, {
        locale: lang,
        destinationCoords: destCoords,
      });
      if (inserted.ok && inserted.kind === "stop") {
        result = inserted.itinerary;
        seenRefs.add(key);
        report.reinserted++;
        report.validated++;
        report.supplyStops++;
        report.issues.push({
          day: inserted.day,
          level: "warn",
          rule: "fixed_reinserted",
          ref: key,
        });
        // Vstavljenemu postanku takoj določi kanonsko ceno (per_person ×
        // groupSize ipd.) — enaka semantika kot za AI odmeve; NI issue
        // "price_mismatch" (naša vstavitev, ne AI napaka).
        const canonicalCost = canonicalCostOf(p.price, opts.groupSize);
        if (canonicalCost) {
          report.canonicalCosts.set(key, canonicalCost);
          result = {
            ...result,
            days: result.days.map((d) => ({
              ...d,
              locations: d.locations.map((s) =>
                s.destination_id === key && s.estimated_cost !== canonicalCost.cost
                  ? { ...s, estimated_cost: canonicalCost.cost }
                  : s
              ),
            })),
          };
        } else if (!INFO_ONLY_PROVIDERS.has(p.provider)) {
          // HARDENING I4/P-3 (deterministična pot): komercialni FIXED produkt
          // BREZ dokazljive cene (verifySelectedProducts jo je odstranil) —
          // prej je insertProductStop zapisal €0 (izmišljena vrednost za
          // PLAČLJIVO turo). Enako pravilo kot AI pot: unknown je unknown —
          // NaN + poštena opomba (AI pot: price_unverified veja zgoraj).
          result = {
            ...result,
            days: result.days.map((d) => ({
              ...d,
              locations: d.locations.map((s) =>
                s.destination_id === key
                  ? {
                      ...s,
                      estimated_cost: Number.NaN,
                      notes:
                        opts.lang === "en"
                          ? "Price not verified — provider is not connected on the server. Check the price and availability with the provider before booking."
                          : "Cena ni preverjena — vir ni strežniško priključen. Ceno in razpoložljivost preveri pri ponudniku pred rezervacijo.",
                    }
                  : s
              ),
            })),
          };
          report.issues.push({
            day: inserted.day,
            level: "warn",
            rule: "price_unverified",
            ref: key,
          });
        }
      }
    }
  }

  return { itinerary: result, report };
}

// ---------------------------------------------------------------------------
// OBSERVABILITY (§18) — agregatne števcke za analitiko (brez PII/skrivnosti)
// ---------------------------------------------------------------------------

/** Minimalna struktura, ki jo potrebujemo od db.analyticsEvent (drži
 *  modul client-varen — brez runtime uvoza Prisme). */
interface AnalyticsEventWriter {
  analyticsEvent: {
    create: (args: {
      data: { type: string; sessionId: string; metadata: string };
    }) => Promise<unknown>;
  };
}

/** Zapiše dogodek itinerary_validated (strežniško, neblokirajoče). */
export async function logItineraryValidation(
  db: AnalyticsEventWriter,
  props: {
    path: "generate" | "refine";
    /** TASK 50: "fallback_echo" = refine veja, kjer je AI odpovedal in se
     *  (strežniško validiran) obstoječi načrt vrača nazaj (§10/§15 dokaz).
     *  TASK 100: "deterministic" = naravna deterministična pot (uporabnik
     *  izrecno zahteval motor brez LLM) — isto dogajanje kot "fallback",
     *  a brez odpovedi AI (ločeno za analitiko). */
    source: "ai" | "fallback" | "deterministic" | "quick_action" | "fallback_echo";
    supply_stops: number;
    validated: number;
    rejected: number;
    deduped: number;
    price_corrections: number;
    geo_restored: number;
    directions_fixed: number;
    reinserted: number;
    fixed_count: number;
    budget_status: BudgetStatus;
    issues: number;
  }
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        type: "itinerary_validated",
        sessionId: "server",
        metadata: JSON.stringify({ props }),
      },
    });
  } catch {
    // analitika je "nice to have" — nikoli ne blokira odgovora
  }
}

// ---------------------------------------------------------------------------
// TASK 56 (P2-2) — SAVE-MEJA REVALIDACIJA (ista veriga kot refine echo)
// ---------------------------------------------------------------------------

/**
 * Kanonska revalidacija itinererja NA MEJI SHRANJEVANJA
 * (/api/itinerary/save → javna deljena povezava /pot/{shareId}).
 *
 * VRZEL (dokazana v TASK 55 reviziji): save je v preteklosti zanesel SAMO
 * sanitizeItinerary (shape guard) — klientova €1 cena, fabrikantrt
 * providerProductId, drug provider ali duplikat so se SHRANILI in prikazali
 * na javni strani. Rešitev PONOVNO UPORABI obstoječo verigo (NI nov
 * verification sistem) — točno to sestavo, ki jo že poganja refine echo
 * pot (refine/route.ts §echo): postanki vhodnega načrta se overijo prek
 * verifyCurrentStopsAuthority (KT dataset = kanon: cena/naslov/geo;
 * fabrikantrt KT ref → ODSTRANJEN; OSM €0 pošteno / trditev → unknown;
 * ostali providerji → cena unknown), nato validateItinerarySupply
 * (dedupe točno 1×, geo/smer obnova, cena kanon ali unknown + iskrena
 * opomba — TASK 50 price_unverified veja) in recomputeTotalBudget
 * (skupna vsota iz DEJANSKIH postankov, isti princip kot P0.2 recenzija).
 *
 * Semantika selection=[]: save ne pozna uporabnikove izbire (ima SAMO
 * načrt) — avtoriteta so izključno overjeni postanki načrta samega, kar
 * je NATANKO refine echo model (TASK 50: postanek v načrtu se ne odstrani
 * nemi — samo njegova klientova cena/geo se overita).
 *
 * KT dataset manjka (svež klon/peskovnik — okoljska odpoved): cena
 * postankov postane unknown (NaN + opomba), postanki ostanejo (NE
 * kaznujemo uporabnika — isto kot verifyCurrentStopsAuthority undefined
 * veja). T1/klepet postanki (id brez dvopičja) so NEDOTIKNJENI.
 *
 * Čista, deterministična funkcija (0 omrežja, 0 db) — testovljiva.
 */
export function revalidateSavedItinerarySupply(
  it: Itinerary,
  lang: "sl" | "en"
): { itinerary: Itinerary; report: SupplyValidationReport } {
  const authority = verifyCurrentStopsAuthority(extractSupplyStops(it));
  const validated = validateItinerarySupply(
    it,
    { selection: [], currentStops: authority.stops },
    { lang }
  );

  // KT NASLOVI: verifyCurrentStopsAuthority jih je ŽE popravila na kanon
  // (report.titlesRestored) — prenesi popravljene vrednosti v izhodni
  // načrt, da prikaz javne deljene strani ne nosi klientovega podtaknjenega
  // imena KANONSKEGA produkta (validateItinerarySupply obnavlja naslov samo
  // pri OBRNITVI smeri iz selection avtoritete, ki je tu prazna). Naslovi
  // drugih providerjev imajo strežnega kanona šele ob priključitvi —
  // ostanejo klientovi (isti prikazni razred kot ostalo prosto besedilo).
  const ktTitles = new Map<string, string>();
  for (const [key, stop] of authority.stops) {
    if (key.startsWith("kiwitaxi:")) {
      ktTitles.set(key, stop.destination_name);
    }
  }
  let result = validated.itinerary;
  if (ktTitles.size > 0) {
    result = {
      ...result,
      days: result.days.map((d) => ({
        ...d,
        locations: (d.locations ?? []).map((loc) => {
          const canonicalName = ktTitles.get(loc.destination_id);
          return canonicalName != null &&
            canonicalName !== loc.destination_name
            ? { ...loc, destination_name: canonicalName }
            : loc;
        }),
      })),
    };
  }

  return {
    itinerary: recomputeTotalBudget(result),
    report: validated.report,
  };
}
