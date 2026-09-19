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
import { isProviderSlug } from "./registry";
import { insertProductStop } from "./stop-insert";
import type {
  PriceInfo,
  ProviderSlug,
  SelectedProviderProduct,
} from "./types";
import type { Itinerary, LocationVisit } from "@/lib/types";

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
    source: "ai" | "fallback" | "quick_action";
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
