// ============================================================================
// TRAVEL SUPPLY MAP — KANONSKA TAKSONOMIJA (F1, 1.49.0)
// ============================================================================
// Enoten nabor tipov produktov z meta podatki za ZEMLJEVID (ikona, barva,
// dvojezična oznaka, minZoom) in OSM filtri za lokalni vir. Vsi adapterji
// (komercialni vključno) preslikajo svoje kategorije VAN tega nabora —
// zemljevid ne pozna ponudnikov, pozna TIPE.
//
// Nasledstvo:CATEGORY_META iz poi-modal.tsx (ikone/barve se ohranjajo —
// vizualna kontinuiteta obstoječega zemljevida 1.47/1.48).
// ============================================================================

import type { ProductType } from "./types";

/** Različica taksonomije — dvignitev ob dodajanju novih tipov. */
export const TAXONOMY_VERSION = 1;

/** Oznaka taksonomije — 6 javnih jezikov (W12 faza 2a; it/de/fr/es dodani
 *  zato, ker se label izrisuje v Leaflet popup badge-ih z label[lang]). */
export interface TaxonomyLabel {
  sl: string;
  en: string;
  it: string;
  de: string;
  fr: string;
  es: string;
}

export interface TaxonomyEntry {
  /** Kanonski tip. */
  type: ProductType;
  /** Ikona (emoji) za pin/čip — kontinuiteta s CATEGORY_META. */
  icon: string;
  /** Barva pina/čipa (semantične barve kategorij — izjema od pravila
   *  "NO blue" kot doslej pri CATEGORY_META). */
  color: string;
  /** 6-jezična oznaka (L vzorec: label[lang]). */
  label: TaxonomyLabel;
  /**
   * Najmanjši zoom, pri katerem se tip sploh prikaže (gostota!):
   * restavracije so goste → šele od z13; nastanitve/atrakcije prej.
   * Komercialni adapterji podedujejo isti prag iz registra ponudnika.
   */
  minZoom: number;
  /** OSM Overpass filtri (nwr izrazi BREZ bbox-a — doda ga adapter). */
  osmFilters?: string[];
}

/** Zajemalni tip za lokalne točke brez specifičnejšega preslikanja. */
export const FALLBACK_TYPE: ProductType = "poi";

export const TAXONOMY: Record<ProductType, TaxonomyEntry> = {
  // --- LOKALNI TIPI (OSM) — nasledstvo obstoječih 8 kategorij zemljevida ---
  attraction: {
    type: "attraction",
    icon: "🎯",
    color: "#d97706",
    label: { sl: "Atrakcija", en: "Attraction", it: "Attrazione", de: "Sehenswürdigkeit", fr: "Attraction", es: "Atracción" },
    minZoom: 8,
    osmFilters: [
      "nwr[tourism=attraction]",
      "nwr[tourism=artwork]",
      "nwr[historic=monument]",
      "nwr[historic=castle]",
    ],
  },
  museum: {
    type: "museum",
    icon: "🏛️",
    color: "#7c3aed",
    label: { sl: "Muzej", en: "Museum", it: "Museo", de: "Museum", fr: "Musée", es: "Museo" },
    minZoom: 10,
    osmFilters: ["nwr[tourism=museum]"],
  },
  viewpoint: {
    type: "viewpoint",
    icon: "👁️",
    color: "#059669",
    label: { sl: "Razgledišče", en: "Viewpoint", it: "Punto panoramico", de: "Aussichtspunkt", fr: "Point de vue", es: "Mirador" },
    minZoom: 10,
    osmFilters: ["nwr[tourism=viewpoint]", "nwr[tourism=picnic_site]"],
  },
  natural: {
    type: "natural",
    icon: "🌿",
    color: "#16a34a",
    label: { sl: "Narava", en: "Nature", it: "Natura", de: "Natur", fr: "Nature", es: "Naturaleza" },
    minZoom: 8,
    osmFilters: [
      "nwr[natural=peak]",
      "nwr[natural=waterfall]",
      "nwr[natural=cave_entrance]",
      "nwr[natural=spring]",
      "nwr[natural=water]",
      "nwr[natural=beach]",
    ],
  },
  religious: {
    type: "religious",
    icon: "⛪",
    color: "#9333ea",
    label: { sl: "Religiozno", en: "Religious", it: "Religioso", de: "Religiöses", fr: "Religieux", es: "Religioso" },
    minZoom: 11,
    osmFilters: ["nwr[amenity=place_of_worship]", "nwr[historic=church]"],
  },
  restaurant: {
    type: "restaurant",
    icon: "🍽️",
    color: "#dc2626",
    label: { sl: "Restavracija", en: "Restaurant", it: "Ristorante", de: "Restaurant", fr: "Restaurant", es: "Restaurante" },
    minZoom: 13,
    osmFilters: [
      "nwr[amenity=restaurant]",
      "nwr[amenity=cafe]",
      "nwr[amenity=bar]",
      "nwr[amenity=fast_food]",
    ],
  },
  accommodation: {
    type: "accommodation",
    icon: "🏨",
    color: "#0891b2",
    label: { sl: "Nastanitev", en: "Stay", it: "Alloggio", de: "Unterkunft", fr: "Hébergement", es: "Alojamiento" },
    minZoom: 11,
    osmFilters: [
      "nwr[tourism=hotel]",
      "nwr[tourism=hostel]",
      "nwr[tourism=guest_house]",
      "nwr[tourism=apartment]",
      "nwr[tourism=motel]",
      // AUDIT 42 (točka 1 — „kamp"): brez camp_site kampi NISO predstavljivi
      "nwr[tourism=camp_site]",
      "nwr[tourism=chalet]",
    ],
  },
  shop: {
    type: "shop",
    icon: "🛍️",
    color: "#ea580c",
    label: { sl: "Trgovina", en: "Shop", it: "Negozio", de: "Geschäft", fr: "Magasin", es: "Tienda" },
    minZoom: 13,
    osmFilters: [
      "nwr[shop=gift]",
      "nwr[shop=wine]",
      "nwr[shop=bakery]",
    ],
  },
  // TASK 58 (potovanja): bencinske postaje — DISCOVERY/INFORMACIJA iz
  // obstoječega lokalnega vira (OSM amenity=fuel). NIKAKRŠNA transakcija
  // (fuel price date ni del taksonomije — vir OSM ga ima redko in
  // zastarelo; cena ostaja UNKNOWN, iskrenost > šumenje).
  petrol: {
    type: "petrol",
    icon: "⛽",
    color: "#b91c1c",
    label: { sl: "Bencinska", en: "Petrol station", it: "Benzinaio", de: "Tankstelle", fr: "Station-service", es: "Gasolinera" },
    minZoom: 12,
    osmFilters: ["nwr[amenity=fuel]"],
  },

  // --- KOMERČALNI TIPI (adapterji jih bodo polnili; OSM nima filtra) ---
  activity: {
    type: "activity",
    icon: "🧭",
    color: "#0d9488",
    label: { sl: "Aktivnost", en: "Activity", it: "Attività", de: "Aktivität", fr: "Activité", es: "Actividad" },
    minZoom: 9,
  },
  tour: {
    type: "tour",
    icon: "🚌",
    color: "#7c2d12",
    label: { sl: "Izlet / tura", en: "Tour", it: "Escursione", de: "Ausflug", fr: "Circuit", es: "Tour" },
    minZoom: 9,
  },
  ticket: {
    type: "ticket",
    icon: "🎟️",
    color: "#b45309",
    label: { sl: "Vstopnica", en: "Ticket", it: "Biglietto", de: "Ticket", fr: "Billet", es: "Entrada" },
    minZoom: 11,
  },
  transfer: {
    type: "transfer",
    icon: "🚕",
    color: "#334155",
    label: { sl: "Transfer", en: "Transfer", it: "Transfer", de: "Transfer", fr: "Transfert", es: "Traslado" },
    minZoom: 10,
  },
  car_rental: {
    type: "car_rental",
    icon: "🚗",
    color: "#57534e",
    label: { sl: "Najem avta", en: "Car rental", it: "Noleggio auto", de: "Mietwagen", fr: "Location de voiture", es: "Alquiler de coche" },
    minZoom: 11,
  },
  transport: {
    type: "transport",
    icon: "🚆",
    color: "#0f766e",
    label: { sl: "Prevoz", en: "Transport", it: "Trasporto", de: "Transport", fr: "Transport", es: "Transporte" },
    minZoom: 9,
  },
  flight: {
    type: "flight",
    icon: "✈️",
    color: "#475569",
    label: { sl: "Let", en: "Flight", it: "Volo", de: "Flug", fr: "Vol", es: "Vuelo" },
    minZoom: 7,
  },
  esim: {
    type: "esim",
    icon: "📶",
    color: "#65a30d",
    label: { sl: "eSIM", en: "eSIM", it: "eSIM", de: "eSIM", fr: "eSIM", es: "eSIM" },
    minZoom: 5,
  },
  insurance: {
    type: "insurance",
    icon: "🛡️",
    color: "#78716c",
    label: { sl: "Zavarovanje", en: "Insurance", it: "Assicurazione", de: "Versicherung", fr: "Assurance", es: "Seguro" },
    minZoom: 5,
  },

  // TASK 58 (potovanja): dogodki iz LOKALNEGA vsebinskega dataseta
  // (events-data) — informacijska plast brez OSM filtra (ni supply sloj;
  // zemljevid potovanja prikaže datum/čas, NIKOLI „na voljo" trditev).
  event: {
    type: "event",
    icon: "🎭",
    color: "#9f1239",
    label: { sl: "Dogodek", en: "Event", it: "Evento", de: "Veranstaltung", fr: "Événement", es: "Evento" },
    minZoom: 10,
  },

  // Zajemalni
  poi: {
    type: "poi",
    icon: "📍",
    color: "#6b7280",
    label: { sl: "Drugo", en: "Other", it: "Altro", de: "Sonstiges", fr: "Autre", es: "Otro" },
    minZoom: 12,
  },
};

/** Uredi tip (neznani → zajemalni 'poi'). */
export function isProductType(v: unknown): v is ProductType {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TAXONOMY, v);
}

export function taxonomyOf(type: ProductType): TaxonomyEntry {
  return TAXONOMY[type] ?? TAXONOMY.poi;
}

/** Meta za stare nizovene kategorije map-view (compat preslikava). */
export function categoryMetaFor(type: string): {
  icon: string;
  color: string;
  label: TaxonomyLabel;
} {
  return isProductType(type) ? TAXONOMY[type] : TAXONOMY.poi;
}

/**
 * Privzeto vidni tipi za zemljevid (enako kot doslej: 5 glavnih lokalnih
 * kategorij vklopljenih; hrana/nastanitve/trgovine so izrecna izbira).
 */
export const DEFAULT_SUPPLY_TYPES: ProductType[] = [
  "attraction",
  "museum",
  "viewpoint",
  "natural",
  "religious",
];

/** Vsi tipi z OSM filtri (lokalni sloj). */
export const LOCAL_OSM_TYPES: ProductType[] = (Object.keys(TAXONOMY) as ProductType[]).filter(
  (t) => (TAXONOMY[t].osmFilters?.length ?? 0) > 0
);
