// ============================================================================
// TASK 49 — SUPPLY INTEGRITY: OVERNITEV IZBIRE PROTI STREŽNIŠKI RESNICI (1.54.0)
// ============================================================================
// P0 POPRAVEK (audit 49, §4/§7): klient pošlje `selectedProviderProducts` /
// trenutni načrt — vsako ceno/razpoložljivost/geo/tip v teh payloadih je
// NEZAUPAN vnos. Do Taska 49 je bila SANITIZIRANA oblika (enumi, kapice,
// whitelist providerjev) dovolj, da je KANONSKA VREDNOST prišla v finalni
// itinerer (živi dokaz: kiwitaxi:411 s ceno 1 € namesto 77 € iz dataseta;
// OSM izdelek s fabrikantrno ceno 5 €; viator:98765 s 79 € brez povezave).
//
// PRAVILO (spec 49 §7): strežniška kanonska resnica ZMAGA; kadar je ni
// mogoče dokazati → UNKNOWN (cena/razpoložljivost se ODSTRANITA, ne ugiba).
//
// Strežniška resnica (brez novih remote klicev — vse v pomnilniku):
//   1. KiwiTaxi: DATASET (popoln inventar, kiwitaxi-routes.json / overlay)
//      → minPriceEur (per_transfer, fromPrice), pin (fromLat/fromLng),
//      naslov (fromName → toName), tip (transfer).
//   2. AiSupplyProduct (strežni supply kontekst, že pridobljen v generaciji):
//      za vse ostale providerje, KJER so dejansko priključeni (danes noben).
//
// Modul je IZKLJUČNO strežniški (uvoz dataset loaderja → node:fs).
// ============================================================================

import { getKiwitaxiDataset } from "./providers/kiwitaxi/dataset";
import type { KiwiRoute } from "./providers/kiwitaxi/types";
import type { AiSupplyProduct } from "./ai-context";
import type { SelectedProviderProduct } from "./types";
import type { LocationVisit } from "@/lib/types";

// ---------------------------------------------------------------------------
// POROČILO (iskrena telemetrija popravkov — števci, brez vsebin)
// ---------------------------------------------------------------------------

export interface SupplyVerifyReport {
  /** Cene, nadomeščene s strežniško kanonsko vrednostjo (kt dataset ∪ supply). */
  priceOverrides: number;
  /** Cene, ODSTRANJENE kot nedokazljive (unknown is unknown — §8 Taska 48). */
  pricesStripped: number;
  /** Fabrikantrne razpoložljivosti → odstranjene (OSM/kt vir jih nima). */
  availabilityStripped: number;
  /** Koordinate, obnovljene iz dataset pina (kiwitaxi). */
  geoRestored: number;
  /** Naslovi, obnovljeni iz dataseta (kiwitaxi). */
  titlesRestored: number;
  /** Tipi, ponastavljeni na kanonski "transfer" (kiwitaxi — FIXED bypass
   *  prek type:"accommodation", ki ga insertProductStop preskoči). */
  typesRestored: number;
  /** Izbire/postanki, ODSTRANJENI ker produkt ne obstaja (kt id ni v datasetu). */
  rejectedFake: number;
}

function emptyReport(): SupplyVerifyReport {
  return {
    priceOverrides: 0,
    pricesStripped: 0,
    availabilityStripped: 0,
    geoRestored: 0,
    titlesRestored: 0,
    typesRestored: 0,
    rejectedFake: 0,
  };
}

/** Ali poročilo nosi vsaj eno spremembo (za console.warn / analitiko). */
export function hasVerifyChanges(r: SupplyVerifyReport): boolean {
  return (
    r.priceOverrides +
      r.pricesStripped +
      r.availabilityStripped +
      r.geoRestored +
      r.titlesRestored +
      r.typesRestored +
      r.rejectedFake >
    0
  );
}

// ---------------------------------------------------------------------------
// KANONSKA POLJA KIWITAXI RUTE (zrcaljenje adapterja, en sam vir resnice)
// ---------------------------------------------------------------------------

/** Kanonska cena KT produkte — minPriceEur je "od" cena per_transfer. */
function ktCanonicalPrice(route: KiwiRoute): {
  amount: number;
  currency: "EUR";
  unit: "per_transfer";
  fromPrice: true;
} {
  return {
    amount: route.minPriceEur,
    currency: "EUR",
    unit: "per_transfer",
    fromPrice: true,
  };
}

/** Dataset lookup po providerProductId (številčni ID rute). */
function ktRouteById(id: string): KiwiRoute | null | undefined {
  const dataset = getKiwitaxiDataset();
  if (!dataset) return undefined; // dataset ni nameščen → NE morem dokazati
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null; // nemogoč id → fabrikantrt
  const route = dataset.routes.find((r) => r.id === n);
  return route ?? null; // null = id NI v popolnem inventarju → fabrikantrt
}

// ---------------------------------------------------------------------------
// OVERNITEV IZBIRE (generacija + refine pošljeta selectedProviderProducts)
// ---------------------------------------------------------------------------

/**
 * Verificira SANITIZIRANO izbiro proti strežniški resnici:
 *  - kiwitaxi + ruta v datasetu → kanonska cena/geo/naslov/tip ZMAGAJO
 *    (odstopanje → popravek); razpoložljivost → NEDOKAZLJIVA (vir je nima).
 *  - kiwitaxi id NI v datasetu (dataset prisoten) → izbira ODSTRANJENA
 *    (fabrikantrt ref — fail-closed, isto kot Task 47/48 za AI odmeve).
 *  - kiwitaxi + dataset MANKKA → produkt ostane, cena/razpoložljivost
 *    odstranjeni (unknown — ne morem dokazati, ne kaznujem uporabnika).
 *  - osm → cena/razpoložljivost VEDNO odstranjeni (info_only vir, ki
//    po zasnovi NIMA cen niti razpoložljivosti).
 *  - ostali providerji (viator/getyourguide …): če so v `serverSupply`
 *    (strežni kontekst — priključen provider) → strežniška cena zmaga;
 *    sicer → cena/razpoložljivost odstranjeni (unknown is unknown).
 */
export function verifySelectedProducts(
  clean: SelectedProviderProduct[],
  serverSupply?: AiSupplyProduct[]
): { products: SelectedProviderProduct[]; report: SupplyVerifyReport } {
  const report = emptyReport();
  const out: SelectedProviderProduct[] = [];

  const serverByKey = new Map<string, AiSupplyProduct>();
  for (const p of serverSupply ?? []) {
    serverByKey.set(`${p.provider}:${p.providerProductId}`, p);
  }

  for (const p of clean) {
    // --- KIWITAXI: popolna strežniška resnica (dataset) ---
    if (p.provider === "kiwitaxi") {
      const route = ktRouteById(p.providerProductId);
      if (route === null) {
        // Dataset prisoten, id pa NI v inventarju → produkta ni → fail-closed.
        report.rejectedFake++;
        continue;
      }
      if (route === undefined) {
        // Dataset manjka → obstoja NE morem dokazati; cene ravno tako ne.
        if (p.price) report.pricesStripped++;
        if (p.availability) report.availabilityStripped++;
        out.push({
          ...p,
          price: undefined,
          availability: undefined,
        });
        continue;
      }
      // Kanonična polja iz dataseta (zrcaljenje adapter mape):
      let next: SelectedProviderProduct = { ...p };
      const canonicalPrice = ktCanonicalPrice(route);
      if (
        !p.price ||
        p.price.amount !== canonicalPrice.amount ||
        p.price.unit !== canonicalPrice.unit ||
        p.price.fromPrice !== true
      ) {
        next = { ...next, price: canonicalPrice };
        report.priceOverrides++;
      }
      if (route.fromLat != null && route.fromLng != null) {
        if (p.lat !== route.fromLat || p.lng !== route.fromLng) {
          next = { ...next, lat: route.fromLat, lng: route.fromLng };
          report.geoRestored++;
        }
      }
      const canonicalTitle = `${route.fromName} → ${route.toName}`;
      if (p.title !== canonicalTitle) {
        next = { ...next, title: canonicalTitle };
        report.titlesRestored++;
      }
      if (p.type !== "transfer") {
        next = { ...next, type: "transfer" };
        report.typesRestored++;
      }
      // KT vir nima razpoložljivosti (CSV) — klientova trditev je fabricated.
      if (p.availability) {
        next = { ...next, availability: undefined };
        report.availabilityStripped++;
      }
      out.push(next);
      continue;
    }

    // --- OSM: info_only vir — cena/razpoložljivost sta nemogoči po zasnovi ---
    if (p.provider === "osm") {
      if (p.price || p.availability) {
        if (p.price) report.pricesStripped++;
        if (p.availability) report.availabilityStripped++;
        out.push({ ...p, price: undefined, availability: undefined });
      } else {
        out.push(p);
      }
      continue;
    }

    // --- OSTALI (viator/getyourguide/…): strežni supply ali unknown ---
    const server = serverByKey.get(`${p.provider}:${p.providerProductId}`);
    if (server) {
      // Priključen provider: strežniška projekcija je kanon (cena/geo/…
      // prihajajo iz istega adapterja, ki je danes edini vir).
      let next: SelectedProviderProduct = { ...p };
      if (
        (!p.price && server.price) ||
        (p.price && server.price && p.price.amount !== server.price.amount)
      ) {
        next = { ...next, price: server.price };
        report.priceOverrides++;
      } else if (p.price && !server.price) {
        next = { ...next, price: undefined };
        report.pricesStripped++;
      }
      if (server.location?.lat != null && server.location?.lng != null) {
        if (p.lat !== server.location.lat || p.lng !== server.location.lng) {
          next = {
            ...next,
            lat: server.location.lat,
            lng: server.location.lng,
          };
          report.geoRestored++;
        }
      }
      if (
        p.availability &&
        p.availability.status !== server.availability?.status
      ) {
        // Klientova trditev o razpoložljivosti → strežna (ali unknown).
        next = { ...next, availability: server.availability };
        report.availabilityStripped++;
      }
      out.push(next);
      continue;
    }
    // Ni strežne resnice → unknown is unknown (produkt ostane kot
    // uporabnikova izbira; cena/razpoložljivost se ne trdita).
    if (p.price) report.pricesStripped++;
    if (p.availability) report.availabilityStripped++;
    out.push({ ...p, price: undefined, availability: undefined });
  }

  return { products: out, report };
}

// ---------------------------------------------------------------------------
// OVERNITEV CURRENTSTOPS AVTORITETE (refine pot — načrt PRED spremembo)
// ---------------------------------------------------------------------------

/**
 * Refine: postanki trenutnega načrta (klientov payload!) so avtoriteta
 * drugega reda v validateItinerarySupply. Ta funkcija čisti AVTORITETO:
 *  - kt ref + ruta v datasetu → estimated_cost/naslov/geo iz dataseta
 *    (odstopanje → popravek);
 *  - kt ref, ki NI v datasetu (dataset prisoten) → postanek IZVZET iz
 *    avtoritete (TASK 48 plast ga nato zavrne kot fake_supply_ref —
 *    fail-closed);
 *  - kt + dataset manjka → cena avtoritete = NaN ("unknown" —
 *    Number.isFinite vrže fallback v validateItinerarySupply);
 *  - osm → obstoj velja, €0 pošteno (brezplačna točka), nebreznične
 *    vrednosti → NaN;
 *  - viator/gyg/… → obstoj velja, cena VEDNO NaN (ni strežne resnice).
 *
 * NaN živi SAMO v avtoritetnem zemljevidu (nikoli v izhodnem načrtu):
 * validateItinerarySupply ga bere izključno prek Number.isFinite.
 */
export function verifyCurrentStopsAuthority(
  stops: Map<string, LocationVisit>
): { stops: Map<string, LocationVisit>; report: SupplyVerifyReport } {
  const report = emptyReport();
  const out = new Map<string, LocationVisit>();

  for (const [key, stop] of stops) {
    const provider = key.split(":")[0];

    if (provider === "kiwitaxi") {
      const route = ktRouteById(key.slice("kiwitaxi:".length));
      if (route === null) {
        // Produkta ni v inventarju → obstoj refa NI veljaven (fail-closed:
        // TASK 48 plast bo ref zavrgla v izhodu — enako kot AI odmev).
        report.rejectedFake++;
        continue;
      }
      if (route === undefined) {
        // Dataset manjka → ne morem dokazati nič; cena = unknown.
        out.set(key, { ...stop, estimated_cost: Number.NaN });
        continue;
      }
      let next = { ...stop };
      const canonicalCost = Math.round(route.minPriceEur);
      if (Number.isFinite(stop.estimated_cost) && stop.estimated_cost !== canonicalCost) {
        next = { ...next, estimated_cost: canonicalCost };
        report.priceOverrides++;
      }
      const canonicalTitle = `${route.fromName} → ${route.toName}`;
      if (stop.destination_name !== canonicalTitle) {
        next = { ...next, destination_name: canonicalTitle };
        report.titlesRestored++;
      }
      if (route.fromLat != null && route.fromLng != null) {
        if (stop.lat !== route.fromLat || stop.lng !== route.fromLng) {
          next = { ...next, lat: route.fromLat, lng: route.fromLng };
          report.geoRestored++;
        }
      }
      out.set(key, next);
      continue;
    }

    // OSM: obstoj refa velja; €0 je poštena vrednost (info_only točke so
    // brezplačne za obisk), NEBREZNIČNA vrednost pa je klientova trditev
    // → unknown (NaN — v budget sloju se ne šteje kot znana).
    if (provider === "osm") {
      if (Number.isFinite(stop.estimated_cost) && stop.estimated_cost !== 0) {
        out.set(key, { ...stop, estimated_cost: Number.NaN });
        report.pricesStripped++;
      } else {
        out.set(key, stop);
      }
      continue;
    }

    // Viator / GetYourGuide / … — brez strežne resnice v refine poti
    // (providerji niso priključeni): obstoj refa velja (uporabnikovo
    // stanje), CENA pa je v vsakem primeru klientova trditev → unknown
    // (tudi €0 — plačljiva tura ni "brezplačna", dokazati ne moremo nič).
    out.set(key, { ...stop, estimated_cost: Number.NaN });
    if (Number.isFinite(stop.estimated_cost) && stop.estimated_cost !== 0) {
      report.pricesStripped++;
    }
  }

  return { stops: out, report };
}
