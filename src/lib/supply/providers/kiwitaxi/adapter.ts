// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI ADAPTER (Task 43, 1.49.0)
// ============================================================================
// Prvi KONCRETEN SupplyAdapter za realnega komercialnega providerja.
// Ni posebnega „KiwiTaxi UI sistema" — provider je samo adapter v enotnem
// toku (naročnik): ProviderRegistry → SupplyAdapter → ProviderProduct →
// /api/supply/search → Map → ProductModal → Add to my plan → AI → /go.
//
// KANONSKA PRESLIKAVA (brez spremembe kanonskega modela!):
//  - type:            "transfer" (kanonska kategorija)
//  - providerProductId: String(route.id) → id "kiwitaxi:{routeId}"
//  - title:           "{fromName} → {toName}"              (name_en vira)
//  - geo:             pin = centroid PREVZEMNEGA območja (iz WKT poligona
//                     kraja) — NIKOLI centroid route; geoPrecision "city"
//                     (predstavniška točka območja — ne „exact")
//  - cena:            min cena med razredi → fromPrice "od €77 / prevoz",
//                     unit per_transfer, note "objavljena cena, ni živi citat"
//  - razpoložljivost: not_supported (CSV koncepta nima — cena NI dokaz)
//  - bookingMode:     affiliate_redirect → bookingUrl /go/transfers?product=
//                     {cheapestTransferId} (NAŠA konstrukcija, NE provider
//                     URL — /go validira in dostavi pap globoko povezavo)
//  - sourceUrl:       https://kiwitaxi.com/en{urlPath} (validirana pot;
//                     render sloj: safeExternalHref)
//  - slika:           ODSOTNA (razredi vozil imajo fotografije, RUTA jih
//                     nima — provider fallback brez slike, §12)
//  - ocena:           ODSOTNA (vir je nima — ne izmišljujemo)
//
// VIEWPORT: dataset NI viewport-queryable pri viru (CSV = celotna množica)
// → strežniški dataset (server-side) + viewport filtriranje po preseku
// prevzemnega območja z bbox (naročnik §9). Browser NIKOLI ne prejme CSV-jev.
//
// ZOOM GATING: runner (search.ts) pokliče adapter SAMO ko je „transfer"
// med vidnimi kategorijami (uporabnik vklopi sloj) in zoom ≥ minZoom (10)
// — brez tega se NE izvede nobeno iskanje (naročnik §9).
// ============================================================================

import type {
  ProviderProduct,
  SupplyQuery,
} from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { bboxIntersects } from "./wkt";
import { getKiwitaxiDataset } from "./dataset";
import { filterValidRoutes } from "./validate";
import type { KiwiRoute } from "./types";

/** Kapika rezultatov adapterja na poizvedbo (gostota pod nadzorom;
 *  globalni kap po zoomu doda search.ts). */
const MAX_RESULTS = 48;

/** Valuta je vedno EUR (price_eur stolpec; vir ima še rub/usd). */
const CURRENCY_NOTE_LIMIT = 60;

// ---------------------------------------------------------------------------
// NORMALIZACIJA RUTE → KANONSKI PRODUKT
// ---------------------------------------------------------------------------

/** Klasifikacija transferja iz tipa prevzemnega kraja (izpeljano iz vira). */
function transferSubcategory(route: KiwiRoute): string {
  switch (route.fromType) {
    case "airport":
      return "airport_transfer";
    case "train_station":
    case "bus_station":
    case "port":
      return "station_transfer";
    default:
      return "intercity_transfer";
  }
}

/** Opis IZKLJUČNO iz podatkov vira (razdalja, trajanje, razredi, cene). */
function buildDescription(route: KiwiRoute, locale: "sl" | "en"): string {
  const classes = route.classes
    .slice(0, 4)
    .map((c) => `${c.name} (≤ ${c.pax}) €${c.eur}`)
    .join(locale === "en" ? ", " : ", ");
  const more =
    route.classes.length > 4
      ? locale === "en"
        ? ` +${route.classes.length - 4} more classes`
        : ` +${route.classes.length - 4} dodatnih razredov`
      : "";
  if (locale === "en") {
    return (
      `Private transfer ${route.fromName} → ${route.toName}: ` +
      `${route.distanceKm} km, approx. ${route.durationMin} min. ` +
      `Vehicle classes (published prices): ${classes}${more}. ` +
      `Prices are per transfer for the whole vehicle.`
    );
  }
  return (
    `Zasebni transfer ${route.fromName} → ${route.toName}: ` +
    `${route.distanceKm} km, približno ${route.durationMin} min. ` +
    `Razredi vozil (objavljene cene): ${classes}${more}. ` +
    `Cene veljajo za celoten prevoz (vozilo), ne po osebi.`
  );
}

export function kiwiRouteToProduct(
  route: KiwiRoute,
  locale: "sl" | "en",
  fetchedAt: string
): ProviderProduct {
  const title = `${route.fromName} → ${route.toName}`;
  return {
    id: `kiwitaxi:${route.id}`,
    provider: "kiwitaxi",
    providerProductId: String(route.id),
    type: "transfer",
    subcategory: transferSubcategory(route),
    title,
    description: buildDescription(route, locale),
    ...(route.fromLat != null && route.fromLng != null
      ? { lat: route.fromLat, lng: route.fromLng }
      : {}),
    geoPrecision: "city",
    address: route.fromName,
    // NAMERNO brez slike: ruta nima fotografije (razredi jo imajo, a slika
    // vozila NE predstavlja celotne ponudbe) — provider fallback (§12).
    // NAMERNO brez ocene: vir je nima.
    price: {
      amount: route.minPriceEur,
      currency: "EUR",
      unit: "per_transfer",
      fromPrice: true,
      note:
        locale === "en"
          ? "published price, not a live quote"
          : "objavljena cena, ni živi citat".slice(0, CURRENCY_NOTE_LIMIT),
    },
    availability: {
      status: "not_supported",
      note:
        locale === "en"
          ? "CSV source has no availability data"
          : "CSV vir nima podatka o razpoložljivosti",
    },
    bookingMode: "affiliate_redirect",
    // NAŠA konstrukcija (ne provider URL): /go validira numerični ID,
    // whitelist from/dest in dostavi pap globoko povezavo (§8).
    bookingUrl: `/go/transfers?product=${route.cheapestTransferId}&from=${encodeURIComponent(
      route.fromName
    )}&dest=${encodeURIComponent(route.toName)}`,
    // Primarni vir: stran rute pri ponudniku (validirana relativna pot —
    // render sloj: safeExternalHref meja).
    sourceUrl: `https://kiwitaxi.com/en${route.urlPath}`,
    // Čas pridobitve od vira (dokumentirana semantika lastUpdated).
    lastUpdated: fetchedAt,
    license: {
      source: "KiwiTaxi Partner Data API (CSV)",
      attribution: "© KiwiTaxi",
    },
  };
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

let lastCached = true; // dataset živi v pomnilniku (baseline/overlay)
let lastNote: string | undefined = undefined;

export function createKiwiTaxiAdapter(
  entry: ProviderRegistryEntry
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastNote = undefined;
      const dataset = getKiwitaxiDataset();
      if (!dataset) {
        // Brez nameščenega dataseta (npr. svež klon pred ingestom) —
        // iskren prazen sloj, NIKOLI napaka: OSM/lokalna plast ostane.
        lastNote = "no-dataset";
        return [];
      }

      // Viewport model: brez bbox ni pina (ne moremo pošteno filtrirati).
      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }

      const valid = filterValidRoutes(dataset.routes as unknown[]);
      const inView = valid.filter((r) => bboxIntersects(r.fromBbox, q.bbox));
      if (inView.length === 0) {
        lastNote = "no-match";
        return [];
      }

      // Gostota pod nadzorom: utež prodaje (providerjev lastni signal iz
      // vira) desc, nato cenigorazred asc — NI lastnega rangiranja.
      inView.sort((a, b) => b.weight - a.weight || a.minPriceEur - b.minPriceEur);
      const capped = inView.slice(0, MAX_RESULTS);

      lastNote = capped.length < inView.length ? "capped" : undefined;
      return capped.map((r) => kiwiRouteToProduct(r, q.locale, dataset.fetchedAt));
    },

    lastRunCached(): boolean {
      return lastCached;
    },
  };
}
