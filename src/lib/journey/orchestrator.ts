// ============================================================================
// TASK 58 — POTOVANJA: OSREDNJI ORKESTRATOR (§3)
// ============================================================================
// Intent → Supply Search (obstoječi adapterji/datasets) → Kanonski produkti →
// zmožnost rezervacije → validacija čas+geo → skupna cena → TravelJourney.
//
// ARHITEKTURNE ODLOČITVE:
//  - NI provider-specifičnih hackov: transfer = KT dataset (obstoječa plast),
//    nastanitve/restavracije/bencin = OSM adapter prek searchSupply runner,
//    dogodki = lokalni EVENTS dataset, najem = affiliate kartica registra.
//  - Kanonski produkti se NE re-validirajo TUKAJ (so že kanon): izbire gredo
//    naprej prek obstoječe verige (selection-verify → itinerary-validation
//    → save revalidacija), ki že vrača ceno/geo/ID iz strežniške resnice.
//  - Čas+geo konsistentnost: orkestrator izračuna najzgodnejši možni prihod
//    (ura prihoda + trajanje transferja iz vira) in izloči dogodke, ki se
//    končajo pred prihodom. GLOBJA konsistenca (nemogoži urnik, vožnje po
//    realnih cestah, odpiralni časi) je obstoječa plast itinererja
//    (repairScheduleGaps + OSRM noge + geo-validacija) — dokumentirana meja.
//  - AI NE izmišljuje: FIXED/PREFERRED/SUGGESTED ostanejo avtoritativni
//    (izbira iz journey strani gre v isti sessionStorage, ki ga bere
//    načrtovalnik — obstoječa integracija).
// ============================================================================

import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { EVENTS } from "@/lib/events-data";
import { EVENTS_EN } from "@/lib/events-data-en";
import type { EventItem } from "@/lib/events-data";
import { searchSupply } from "@/lib/supply/search";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug } from "@/lib/supply/types";
import {
  activeProviders,
  PROVIDER_REGISTRY,
  type ProviderRegistryEntry,
} from "@/lib/supply/registry";
import type { KiwiRoute } from "@/lib/supply/providers/kiwitaxi/types";
import {
  getKiwitaxiDataset,
  searchKiwitaxiRoutes,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { kiwiRouteToProduct } from "@/lib/supply/providers/kiwitaxi/adapter";
import { randomId } from "@/lib/security";
import {
  bookingCapabilityOf,
  defaultMapStatus,
} from "./booking";
import { computeJourneyTotals } from "./totals";
import type {
  JourneyCategoryKey,
  JourneyCategoryResult,
  JourneyIntent,
  JourneyPlace,
  JourneyProduct,
  JourneyValidationIssue,
  TravelJourney,
} from "./types";
import { JOURNEY_CATEGORY_KEYS } from "./types";

// ---------------------------------------------------------------------------
// POMOŽNE (čiste)
// ---------------------------------------------------------------------------

/** Haversine razdalja (km) — isti vzorec kot geo-validacija. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalize(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Privzeta ura prihoda (§6 zgleda: 14:00 — iskren privzetek, vidna v UI). */
const DEFAULT_ARRIVAL = "12:00";

/** Kanonski vzdevki izhodišč (zgled naročnika: „Brnik"). */
const ORIGIN_ALIASES: Record<string, string> = {
  brnik: "Ljubljana Airport",
  "ljubljana airport brnik": "Ljubljana Airport",
  "letalisce brnik": "Ljubljana Airport",
  "ljubljansko letalisce": "Ljubljana Airport",
};

/** Izhod napake (400-class — klicalnik (ruta) jo preslika v HTTP). */
export interface JourneyPlanError {
  error: string;
}

/** Zgled izbire KT rute za prikaz (kap — gostota pod nadzorom). */
const MAX_TRANSFER_ROUTES = 6;
/** Kap razredov vozil na potovalni kartici transferja. */
const MAX_VEHICLE_CLASSES = 8;
/** Bbox okoli destinacije za lokalne kategorije (deg — ~5 km). */
const DEST_BBOX_DELTA = 0.05;
/** Kap produktov na potovalno kategorijo (lokalne/plast). */
const MAX_CATEGORY_PRODUCTS = 12;

// ---------------------------------------------------------------------------
// PRESLIKAVE KANONSKIH PRODUKTOV → POTOVALNI PRODUKT (sledljivost §5)
// ---------------------------------------------------------------------------

function providerProductToJourney(
  p: ProviderProduct,
  category: JourneyCategoryKey,
  destCenter: { lat: number; lng: number }
): JourneyProduct {
  const booking = bookingCapabilityOf(p.bookingMode);
  return {
    id: p.id,
    provider: p.provider,
    providerProductId: p.providerProductId,
    type: p.type,
    title: p.title,
    description: p.description,
    lat: p.lat,
    lng: p.lng,
    geoPrecision: p.geoPrecision,
    address: p.address,
    price: p.price,
    availability: p.availability,
    bookingMode: p.bookingMode,
    bookingUrl: p.bookingUrl,
    sourceUrl: p.sourceUrl,
    openingHours: p.openingHours,
    phone: p.phone,
    rating: p.rating,
    reviewCount: p.reviewCount,
    category,
    mapStatus: defaultMapStatus(booking.flow),
    ...(p.lat != null && p.lng != null
      ? {
          distanceKm:
            Math.round(
              haversineKm(destCenter, { lat: p.lat, lng: p.lng }) * 10
            ) / 10,
        }
      : {}),
    booking,
  };
}

function eventToJourney(
  e: EventItem,
  lang: "sl" | "en"
): JourneyProduct {
  const en = lang === "en" ? EVENTS_EN[e.id] : undefined;
  return {
    id: `events:${e.id}`,
    provider: "events",
    providerProductId: e.id,
    type: "event",
    title: en?.name ?? e.name,
    description: en?.description ?? e.description,
    address: e.location,
    // Dogodki lokalnega dataseta NIMAJO geo/cene/razpoložljivosti — iskreno
    // izpuščeno (priceRange je OZNAKA „€", ne številka — ne izmišljujemo).
    bookingMode: "info_only",
    sourceUrl: e.website,
    category: "events",
    mapStatus: "informational",
    eventDate: { start: e.date, ...(e.endDate ? { end: e.endDate } : {}) },
    note: {
      sl: "Informacijski dogodek — nakup vstopnic ni podprt (preveri pri viru)",
      en: "Informational event — ticket purchase not supported (check with the source)",
    },
    booking: bookingCapabilityOf("info_only"),
  };
}

// ---------------------------------------------------------------------------
// TASK 58 §24 — PROVIDER-AGNOSTIC SEAM ZA LOKALNE TRANSFER INVENTARJE
// (isti vzorec kot ADAPTER_FACTORIES v search.ts): register → slug →
// resolver. Provider-specifična logika Živi ZNOTRAJ provider meje
// (dataset.ts/adapter.ts); orkestrator vrti SAMO prek registra + te
// registracije — NIKOLI if (provider === "...").
// ---------------------------------------------------------------------------

/** Resolver lokalnega (ingested) transfer inventarja (provider meja). */
interface TransferInventoryResolver {
  /** Iskanje rut po imenih (null = dataset manjka — okoljska odpoved). */
  searchRoutes(from: string, to: string): KiwiRoute[] | null;
  /** Ruta → kanonski ProviderProduct (preslikava provider meje). */
  routeToProduct(route: KiwiRoute, locale: "sl" | "en", fetchedAt: string): ProviderProduct;
  /** fetchedAt trenutno strežene generacije (null = dataset manjka). */
  datasetFetchedAt(): string | null;
}

const TRANSFER_INVENTORY_RESOLVERS: Partial<
  Record<ProviderSlug, TransferInventoryResolver>
> = {
  // Edini lokalni transfer inventar danes (Task 43 CSV ingest).
  kiwitaxi: {
    searchRoutes: searchKiwitaxiRoutes,
    routeToProduct: kiwiRouteToProduct,
    datasetFetchedAt: () => getKiwitaxiDataset()?.fetchedAt ?? null,
  },
};

/** Aktivni ponudniki transferjev z lokalnim (static) inventarjem — IZ registra. */
function transferInventoryProviders(): ProviderRegistryEntry[] {
  return activeProviders().filter(
    (p) =>
      p.types.includes("transfer") &&
      p.inventoryAccess.includes("static_content")
  );
}

/** Geo izhodišča iz podatkov transfer inventarjev (registry-driven). */
function findTransferOriginGeo(
  query: string,
  destinationName: string
): { label: string; lat: number; lng: number } | null {
  for (const entry of transferInventoryProviders()) {
    const resolver = TRANSFER_INVENTORY_RESOLVERS[entry.slug];
    if (!resolver) continue;
    const routes = resolver.searchRoutes(query, destinationName);
    const withGeo = routes?.find(
      (r) => r.fromLat != null && r.fromLng != null
    );
    if (withGeo?.fromLat != null && withGeo?.fromLng != null) {
      return { label: withGeo.fromName, lat: withGeo.fromLat, lng: withGeo.fromLng };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// RAZREŠEVANJE KRAJEV
// ---------------------------------------------------------------------------

function resolveDestination(
  raw: string
): { id: string; name: string; lat: number; lng: number } | null {
  const n = normalize(raw);
  if (!n) return null;
  const byId = getDestinationById(n) ?? getDestinationById(raw);
  if (byId?.coords) {
    return { id: byId.id, name: byId.name, ...byId.coords };
  }
  const byName = DESTINATIONS.find(
    (d) => normalize(d.name) === n && d.coords
  );
  if (byName) return { id: byName.id, name: byName.name, ...byName.coords };
  return null;
}

/**
 * Izhodišče: vzdevek → KT dataset geo (DEJANSKE koordinate prevzemnega
 * območja iz partnerjevih podatkov — najbolj pošten vir za letališča),
 * sicer destinacijski center, sicer nerešeno (iskrena opomba).
 */
function resolveOrigin(
  raw: string,
  destinationName: string
): { place: JourneyPlace; query: string } {
  const n = normalize(raw);
  const alias = ORIGIN_ALIASES[n];
  const query = alias ?? raw.trim();

  // 1) Lokalni transfer inventarji (registry-driven §24): rute IZ tega
  //    kraja nosijo fromLat/fromLng (geo IZ podatkov partnerja).
  const geo = findTransferOriginGeo(query, destinationName);
  if (geo) {
    return {
      place: {
        label: alias ? `${geo.label} (Brnik)` : geo.label,
        lat: geo.lat,
        lng: geo.lng,
        source: "transfer-inventory",
      },
      query,
    };
  }

  // 2) Destinacijski center (npr. izhodišče „Ljubljana" = mesto).
  const dest = resolveDestination(raw);
  if (dest) {
    return {
      place: { label: dest.name, lat: dest.lat, lng: dest.lng, source: "destinations" },
      query: dest.name,
    };
  }

  // 3) Nerešeno — iskreno (transfer iskanje še poskusi z raw nizom).
  return { place: { label: raw.trim() || "—", source: "unresolved" }, query };
}

// ---------------------------------------------------------------------------
// KATEGORIJE
// ---------------------------------------------------------------------------

function emptyCategory(key: JourneyCategoryKey): JourneyCategoryResult {
  return { key, products: [], providers: [] };
}

async function transferCategory(
  originQuery: string,
  destinationName: string,
  lang: "sl" | "en",
  issues: JourneyValidationIssue[],
  degradedProviders: string[]
): Promise<JourneyCategoryResult> {
  const cat = emptyCategory("transfer");
  const providers = transferInventoryProviders();
  const products: JourneyProduct[] = [];
  let totalRoutes = 0;
  let datasetsMissing = 0;
  const providerLabels: string[] = [];

  // §24: register-driven — DANES je edini lokalni transfer inventar
  // kiwitaxi (Task 43 CSV); prihodnji inventarji se priključijo SAMO prek
  // TRANSFER_INVENTORY_RESOLVERS registracije (brez if-provider verig).
  for (const entry of providers) {
    const resolver = TRANSFER_INVENTORY_RESOLVERS[entry.slug];
    if (!resolver) continue;
    providerLabels.push(entry.labels[lang]);
    const fetchedAt = resolver.datasetFetchedAt();
    if (fetchedAt == null) {
      datasetsMissing++;
      degradedProviders.push(entry.slug);
      continue;
    }
    const routes = resolver.searchRoutes(originQuery, destinationName) ?? [];
    if (routes.length === 0) continue;
    totalRoutes += routes.length;
    for (const r of routes.slice(0, MAX_TRANSFER_ROUTES)) {
      const base = providerProductToJourney(
        resolver.routeToProduct(r, lang, fetchedAt),
        "transfer",
        // Razdalja transferja je podatkov vira (distanceKm), ne haversine.
        { lat: r.fromLat ?? 0, lng: r.fromLng ?? 0 }
      );
      products.push({
        ...base,
        durationMin: r.durationMin,
        vehicleOptions: r.classes
          .slice(0, MAX_VEHICLE_CLASSES)
          .map((c) => ({
            name: c.name,
            pax: c.pax,
            eur: c.eur,
            transferId: c.transferId,
          })),
      });
    }
  }

  // §22 izolacija: dataset manjka pri VSEH virih → kategorija izostane z
  // opombo, potovanje SE NADALJUJE (ne sesuje ostalih kategorij).
  if (providers.length > 0 && datasetsMissing === providers.length) {
    issues.push({
      level: "warn",
      rule: "dataset_missing",
      message: {
        sl: `Vir transferjev (${providerLabels.join(", ")}) ni na voljo (dataset manjka) — transferji trenutno niso na voljo.`,
        en: `Transfer source (${providerLabels.join(", ")}) unavailable (dataset missing) — transfers are currently unavailable.`,
      },
    });
    cat.note = {
      sl: "Vir transferjev ni dosegljiv (dataset manjka).",
      en: "Transfer source unavailable (dataset missing).",
    };
    return cat;
  }

  if (products.length === 0) {
    issues.push({
      level: "warn",
      rule: "no_transfer_route",
      message: {
        sl: `Za relacijo ${originQuery} → ${destinationName} ni transfer rute v objavljenem inventarju.`,
        en: `No transfer route found for ${originQuery} → ${destinationName} in the published inventory.`,
      },
    });
    cat.note = {
      sl: "Ni rute v objavljenem inventarju (poskusi drugo relacijo).",
      en: "No route in the published inventory (try another relation).",
    };
    return cat;
  }

  cat.products = products.slice(0, MAX_TRANSFER_ROUTES);
  cat.note = {
    sl: `Objavljeni podatki (${providerLabels.join(", ")}): ${totalRoutes} rut; cene so „od", ne živi citat.`,
    en: `Published data (${providerLabels.join(", ")}): ${totalRoutes} routes; prices are “from”, not live quotes.`,
  };
  return cat;
}

async function localCategories(
  destination: { name: string; lat: number; lng: number },
  travelers: number,
  lang: "sl" | "en",
  wanted: Set<JourneyCategoryKey>,
  degradedProviders: string[],
  adapters?: SupplyAdapter[]
): Promise<{
  accommodation: JourneyCategoryResult;
  restaurants: JourneyCategoryResult;
  petrol: JourneyCategoryResult;
}> {
  const accommodation = emptyCategory("accommodation");
  const restaurants = emptyCategory("restaurants");
  const petrol = emptyCategory("petrol");

  const needsOsm =
    wanted.has("accommodation") || wanted.has("restaurants") || wanted.has("petrol");
  if (!needsOsm) return { accommodation, restaurants, petrol };

  // ENA skupna poizvedba runnerja (zoom 14 = vse tri kategorije vidne;
  // cap 400/zoom — bbox ~10×10 km okoli destinacije).
  const bbox: [number, number, number] | [number, number, number, number] = [
    destination.lat - DEST_BBOX_DELTA,
    destination.lng - DEST_BBOX_DELTA,
    destination.lat + DEST_BBOX_DELTA,
    destination.lng + DEST_BBOX_DELTA,
  ];
  const cats = ["accommodation", "restaurant", "petrol"].filter((c) =>
    wanted.has(c === "restaurant" ? "restaurants" : (c as JourneyCategoryKey))
  ) as ("accommodation" | "restaurant" | "petrol")[];

  const res = await searchSupply(
    {
      bbox: bbox as [number, number, number, number],
      zoom: 14,
      cats,
      pax: travelers,
      locale: lang,
    },
    adapters
  );

  // §22/§30: odpoved ENEGA adapterja NE uniči potovanja — zabeležži
  // se v supplyHealth (structured event), kategorije ostanejo (morda prazne
  // z opombo); runner že izolira (Promise.allSettled + degraded[]).
  for (const a of res.adapters) {
    if (!a.ok && !degradedProviders.includes(a.slug)) degradedProviders.push(a.slug);
  }
  const localDegraded = res.adapters.some((a) => !a.ok);
  const degradedNote = localDegraded
    ? {
        sl: "Lokalni vir je trenutno nedosegljiv (ostalo potovanje deluje).",
        en: "A local source is currently unreachable (the rest of the journey still works).",
      }
    : undefined;

  const destCenter = { lat: destination.lat, lng: destination.lng };

  for (const p of res.products) {
    if (p.type === "accommodation" && wanted.has("accommodation")) {
      if (accommodation.products.length < MAX_CATEGORY_PRODUCTS)
        accommodation.products.push(
          providerProductToJourney(p, "accommodation", destCenter)
        );
    } else if (p.type === "restaurant" && wanted.has("restaurants")) {
      if (restaurants.products.length < MAX_CATEGORY_PRODUCTS)
        restaurants.products.push(
          providerProductToJourney(p, "restaurants", destCenter)
        );
    } else if (p.type === "petrol" && wanted.has("petrol")) {
      if (petrol.products.length < MAX_CATEGORY_PRODUCTS)
        petrol.products.push(providerProductToJourney(p, "petrol", destCenter));
    }
  }

  // Razvrsti po razdalji (najbližje prvi — pošteno za „blizu hotela").
  const byDistance = (a: JourneyProduct, b: JourneyProduct) =>
    (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
  accommodation.products.sort(byDistance);
  restaurants.products.sort(byDistance);
  petrol.products.sort(byDistance);

  if (degradedNote) {
    accommodation.note = degradedNote;
    restaurants.note = degradedNote;
    petrol.note = degradedNote;
  }
  return { accommodation, restaurants, petrol };
}

function eventsCategory(
  destinationId: string,
  startDate: string | undefined,
  lang: "sl" | "en"
): JourneyCategoryResult {
  const cat = emptyCategory("events");
  let all = EVENTS.filter((e) => e.destinationId === destinationId);

  // Dogodki, ki se KONČAJO pred prihodom, za to potovanje niso relevantni
  // (datum konsistenca §15 — brez lažne „na voljo" trditve).
  let skipped = 0;
  if (startDate) {
    const kept: typeof all = [];
    for (const e of all) {
      const ends = e.endDate ?? e.date;
      if (ends < startDate) skipped++;
      else kept.push(e);
    }
    all = kept;
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  cat.products = all.slice(0, MAX_CATEGORY_PRODUCTS).map((e) =>
    eventToJourney(e, lang)
  );
  cat.note =
    all.length === 0
      ? {
          sl: "V lokalnem koledarju dogodkov za to destinacijo trenutno ni prihajajočih dogodkov.",
          en: "No upcoming events in the local events calendar for this destination.",
        }
      : skipped > 0
        ? {
            sl: `${skipped} dogodkov pred prihodom izpuščenih.`,
            en: `${skipped} events before arrival skipped.`,
          }
        : undefined;
  return cat;
}

function rentalCategory(destinationName: string): JourneyCategoryResult {
  const cat = emptyCategory("rental");
  // §24 REGISTER-DRIVEN: komercialni ponudniki najema z affiliate-only
  // dostopom (brez lokalnega inventarja) → iskrene KARTICE (affiliate ≠
  // inventar — NIKOLI ProviderProduct). Pravi podprti tok vsakega = /go.
  // Danes: discovercars (edini vrsta car_rental v registru).
  for (const entry of PROVIDER_REGISTRY) {
    if (!entry.types.includes("car_rental")) continue;
    if (entry.group !== "commercial") continue;
    if (!entry.goRoute) continue;
    if (!entry.inventoryAccess.includes("affiliate_deep_link")) continue;
    cat.providers.push({
      provider: entry.slug,
      label: entry.labels,
      url: `/go/${entry.goRoute}?dest=${encodeURIComponent(destinationName)}`,
      booking: bookingCapabilityOf("affiliate_redirect"),
      status: "affiliate",
      note: entry.accessNote,
    });
  }
  cat.note = {
    sl: "Najem avta: danes samo zunanja rezervacija pri ponudniku (affiliate) — iskanje po živi ponudbi zahteva B4B pogodbo.",
    en: "Car rental: today external booking at the provider only (affiliate) — live inventory search requires a B4B agreement.",
  };
  return cat;
}

// ---------------------------------------------------------------------------
// ČASOVNA KONSISTENCA (§15) — najzgodnejši možni prihod na destinacijo
// ---------------------------------------------------------------------------

function earliestArrival(
  arrivalTime: string,
  transferRoutes: JourneyProduct[]
): { time: string; via: string } | undefined {
  const fastest = transferRoutes.reduce<number | undefined>((min, p) => {
    if (p.durationMin == null) return min;
    return min == null || p.durationMin < min ? p.durationMin : min;
  }, undefined);
  if (fastest == null) return undefined;

  const [h, m] = arrivalTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  const total = h * 60 + m + fastest;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const via = transferRoutes.find((p) => p.durationMin === fastest)?.title ?? "";
  return { time, via };
}

// ---------------------------------------------------------------------------
// GLAVNI ORKESTRATOR
// ---------------------------------------------------------------------------

/**
 * Načrtuj potovalno verigo iz INTENTA. Čista nad CLIENT-VARNIMI vnosi
 * (vsako kanonsko polje je strežniško); 0 remotih klicev razen obstoječega
 * OSM runnerja (živi Overpass — obstoječa arhitektura, spoštovani
// timeoute/rate limiti registra). `opts.adapters` = dependency injection
 * za teste (isti vzorec kot searchSupply runner) — produkcijska pot dobi
 * privzete adapterje registrov.
 */
export async function planJourney(
  intent: JourneyIntent,
  opts?: { adapters?: SupplyAdapter[] }
): Promise<TravelJourney | JourneyPlanError> {
  // --- validacija intenta ---
  const travelers = Math.min(20, Math.max(1, Math.floor(intent.travelers || 2)));
  const lang = intent.lang === "en" ? "en" : "sl";
  const arrivalTime = TIME_RE.test(intent.arrivalTime ?? "")
    ? (intent.arrivalTime as string)
    : DEFAULT_ARRIVAL;
  if (intent.startDate && (!DATE_RE.test(intent.startDate) || Number.isNaN(Date.parse(intent.startDate)))) {
    return { error: "Neveljaven startDate (pričakovan ISO format YYYY-MM-DD)" };
  }
  const wanted = new Set<JourneyCategoryKey>(
    (intent.categories ?? []).filter((c) =>
      (JOURNEY_CATEGORY_KEYS as readonly string[]).includes(c)
    )
  );
  if (wanted.size === 0) {
    for (const k of JOURNEY_CATEGORY_KEYS) wanted.add(k);
  }

  // --- destinacija ---
  const dest = resolveDestination(intent.destination);
  if (!dest) {
    return {
      error: `Neznana destinacija: ${intent.destination} (izberi eno od ${DESTINATIONS.length} podprtih)`,
    };
  }

  // --- izhodišče ---
  const issues: JourneyValidationIssue[] = [];
  const origin = resolveOrigin(intent.origin || dest.name, dest.name);
  if (origin.place.source === "unresolved") {
    issues.push({
      level: "warn",
      rule: "origin_unresolved",
      message: {
        sl: `Izhodišča „${intent.origin}" ni bilo mogoče geolocirati — prikazano je brez koordinat.`,
        en: `Origin “${intent.origin}” could not be geolocated — shown without coordinates.`,
      },
    });
  }

  // --- kategorije (obstoječi viri; §22: odpoved enega vira ne uniči poti) ---
  const degradedProviders: string[] = [];
  const transfer =
    wanted.has("transfer")
      ? await transferCategory(origin.query, dest.name, lang, issues, degradedProviders)
      : emptyCategory("transfer");
  const local = await localCategories(dest, travelers, lang, wanted, degradedProviders, opts?.adapters);
  const events =
    wanted.has("events")
      ? eventsCategory(dest.id, intent.startDate, lang)
      : emptyCategory("events");
  const rental = wanted.has("rental") ? rentalCategory(dest.name) : emptyCategory("rental");

  // --- časovna konsistenca ---
  const earliest = earliestArrival(arrivalTime, transfer.products);

  // --- skupna cena (kanonska semantika) ---
  const allProducts = [
    ...transfer.products,
    ...local.accommodation.products,
    ...local.restaurants.products,
    ...local.petrol.products,
    ...events.products,
  ];
  const totals = computeJourneyTotals(allProducts);

  const journey: TravelJourney = {
    id: randomId(10).toLowerCase(),
    lang,
    origin: origin.place,
    destination: {
      label: dest.name,
      lat: dest.lat,
      lng: dest.lng,
      source: "destinations",
    },
    travelers,
    ...(intent.startDate ? { startDate: intent.startDate } : {}),
    arrivalTime,
    categories: {
      transfer,
      accommodation: local.accommodation,
      events,
      restaurants: local.restaurants,
      petrol: local.petrol,
      rental,
    },
    totals,
    validation: { issues },
    supplyHealth: { degradedProviders },
    ...(earliest ? { earliestArrivalAtDestination: earliest } : {}),
    generatedAt: new Date().toISOString(),
  };
  return journey;
}
