// ============================================================================
// TASK 58 — FULL PROVIDER JOURNEY: KANONSKI MODEL POTOVANJA (1.59.0)
// ============================================================================
// Osrednja plast orkestracije ENEGA uporabnikovega potovanja čez VSE
// obstoječe ponudnike. NE gradi novega verifica — kanonski produkti pridejo
// IZ obstoječe arhitekture (registry → adapter → searchSupply / KT dataset /
// EVENTS) in vsaka izbira gre naprej prek OBSTOJEČE verige (izbira →
// selection-verify → itinerary-validation → save → /pot).
//
// NAČELA (spec naročnika):
//  - affiliate povezava ≠ inventar; bookingUrl ≠ opravljena rezervacija;
//    cena ≠ razpoložljivost; fromPrice ≠ končna cena; preusmeritev ≠ plačilo;
//    EXTERNAL ≠ CONFIRMED; AI orkestrira, ne izmišljuje.
//  - klientov vput NIKOLI ne postane avtoriteten (cena/ID/geo/razpoložljivost
//    so strežniške — obstoječa veriga).
//  - perspektiva: SavedItinerary ostane ENOTNI vir resnice potovanja
//    („one user — one trip"); journey je kontekst + načrt + potrditve.
// ============================================================================

import type {
  AvailabilityStatus,
  BookingMode,
  GeoPrecision,
  PriceInfo,
  ProductType,
  ProviderSlug,
} from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// KATEGORIJE POTOVANJA (zgled: prihod → transfer → nastanitev → dogodki →
// restavracije → bencin → najem avta)
// ---------------------------------------------------------------------------

export type JourneyCategoryKey =
  | "transfer"
  | "accommodation"
  | "events"
  | "restaurants"
  | "petrol"
  | "rental";

export const JOURNEY_CATEGORY_KEYS: readonly JourneyCategoryKey[] = [
  "transfer",
  "accommodation",
  "events",
  "restaurants",
  "petrol",
  "rental",
];

// ---------------------------------------------------------------------------
// TOK REZERVACIJE (§2/§17) — izpeljan IZ kanonskega bookingMode + registra,
// NIKOLI iz klientove trditve.
// ---------------------------------------------------------------------------

/** Tok rezervacije produkta (preslikava bookingMode → potovalni tok). */
export type BookingFlow =
  | "api_booking" // rezervacija prek partnerskega API-ja (danes: NIČEN journey ponudnik)
  | "external_affiliate" // zunanja rezervacija prek verificirane /go povezave
  | "info_only"; // samo informacija (OSM POI, dogodki brez vstopnic)

/** Kje se zgodi plačilo (§18 — BREZ fake Stripe). */
export type PaymentCapability =
  | "merchant_side" // naše plačilo (SAMO lastna tržnica — Stripe, ločena pot)
  | "external_provider" // plačilo pri ponudniku po preusmeritvi
  | "none"; // transakcija ne obstaja (info_only)

/** Kaj se lahko potrdi (§19). */
export type ConfirmationCapability =
  | "provider_api" // provider vrača potrditev (danes: NIČEN journey ponudnik)
  | "external" // potrditev pri ponudniku, NAM neznana (affiliate tok)
  | "none"; // nič za potrditi (info_only)

/** Status potrditve rezervacije (§19 — EXTERNAL NIKOLI postane CONFIRMED). */
export type ConfirmationStatus =
  | "SELECTED"
  | "PENDING"
  | "PAYMENT_REQUIRED"
  | "PAID"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN"
  | "EXTERNAL";

export const CONFIRMATION_STATUSES: readonly ConfirmationStatus[] = [
  "SELECTED",
  "PENDING",
  "PAYMENT_REQUIRED",
  "PAID",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
  "EXTERNAL",
];

// ---------------------------------------------------------------------------
// STATUS PINA NA ZEMLJEVIDU POTOVANJA (§13) — barva NIKOLI ne nakazuje
// rezervacije, ki je ni (booked/pending/failed so modelsko dosegljivi SAMO
// prek API_BOOKING plov — danes 0 ponudnikov).
// ---------------------------------------------------------------------------

export type MapProductStatus =
  | "selected" // uporabnikova izbira (≡ FIXED/PREFERRED semantika)
  | "recommended" // strežniško priporočilo (≡ SUGGESTED)
  | "informational" // informacijska točka brez rezervacije
  | "booked" // potrjena rezervacija (danes NEDOSEGLJIVO — 0 API_BOOKING)
  | "pending" // čaka na ponudnika (danes NEDOSEGLJIVO)
  | "failed"; // spodletela rezervacija (danes NEDOSEGLJIVO)

// ---------------------------------------------------------------------------
// ZMOŽNOST REZERVACIJE PRODUKTA (izpeljana strežniško iz kanona)
// ---------------------------------------------------------------------------

export interface BookingCapability {
  flow: BookingFlow;
  payment: PaymentCapability;
  confirmation: ConfirmationCapability;
  /** Iskrena dvojezična oznaka za UI (NPR „Rezervacija pri ponudniku"). */
  label: { sl: string; en: string };
}

// ---------------------------------------------------------------------------
// KANONSKI PRODUKT POTOVANJA (§5 — popolna sledljivost; VSA polja
// strežniško izpeljana iz obstoječega kanonskega produkta/dataseta)
// ---------------------------------------------------------------------------

/** Razred vozila KT transferja (iz dataseta — realni podatek vira). */
export interface JourneyVehicleOption {
  /** Ime razreda (Economy, Comfort, …) — name_en vira. */
  name: string;
  /** Max potnikov (pax vira). */
  pax: number;
  /** Objavljena EUR cena za ta razred (per_transfer, fromPrice). */
  eur: number;
  /** ID transferja pri ponudniku (deep-link /go produkt). */
  transferId: number;
}

export interface JourneyProduct {
  // --- kanonska identiteta (iz ProviderProduct / dataset / EVENTS) ---
  id: string; // `${provider}:${providerProductId}`
  provider: ProviderSlug | "events";
  providerProductId: string;
  type: ProductType;
  title: string;
  description?: string;
  lat?: number;
  lng?: number;
  geoPrecision?: GeoPrecision;
  address?: string;
  price?: PriceInfo; // KANONSKA semantika (amount/unit/fromPrice/note)
  availability?: { status: AvailabilityStatus; note?: string };
  bookingMode: BookingMode;
  bookingUrl?: string; // strežniško izgrajen (NIKOLI klientov)
  sourceUrl?: string;
  openingHours?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;

  // --- potovalna sledljivost (§5 nad-kon) ---
  category: JourneyCategoryKey;
  mapStatus: MapProductStatus;
  /** Razdalja od središča destinacije (haversine, km) — kjer ima geo. */
  distanceKm?: number;
  /** Trajanje transferja (KT durationMin iz vira). */
  durationMin?: number;
  /** Razredi vozil (SAMO KT transferji — realni iz dataseta). */
  vehicleOptions?: JourneyVehicleOption[];
  /** Datum/čas dogodka (SAMO events — iz lokalnega dataseta). */
  eventDate?: { start: string; end?: string };
  /** Iskrena opomba produkta (npr. affiliate kartica kategorije). */
  note?: { sl: string; en: string };

  // --- zmožnost rezervacije (IZPELJANA — glej booking.ts) ---
  booking: BookingCapability;
}

// ---------------------------------------------------------------------------
// INTENT POTOVANJA (vhod orkestratorja)
// ---------------------------------------------------------------------------

export interface JourneyIntent {
  /** Izhodišče: „brnik", „ljubljana airport", ali id destinacije. */
  origin: string;
  /** Destinacija: id iz DESTINATIONS (npr. „maribor") ali ime. */
  destination: string;
  /** ISO datum prihoda (YYYY-MM-DD). */
  startDate?: string;
  /** Ura prihoda (HH:MM) — privzetek 12:00. */
  arrivalTime?: string;
  /** Št. popotnikov (1–20). */
  travelers: number;
  /** Zahtevane kategorije (prazno = vse). */
  categories?: JourneyCategoryKey[];
  lang: "sl" | "en";
}

// ---------------------------------------------------------------------------
// SKUPNA CENA POTOVANJA (§16 — ločba, unknown NIKOLI kot 0)
// ---------------------------------------------------------------------------

export interface JourneyTotals {
  /** SAMO iz PLAČANIH/potrjenih rezervacij (JourneyBooking CONFIRMED/PAID). */
  confirmedTotal: number;
  /** Kanonske ne-fromPrice cene (danes redko — iskrenost). */
  knownTotal: number;
  /** Vsota fromPrice („od" — spodnja meja, NI obljuba). */
  estimatedTotal: number;
  /** Št. produktov z NEZNANO ceno (izrecno — nikoli prišteto kot 0). */
  unknownCount: number;
  /** Št. produktov s fromPrice ceno. */
  fromPriceCount: number;
  currency: "EUR";
}

// ---------------------------------------------------------------------------
// VALIDACIJA ČAS + GEO (§15)
// ---------------------------------------------------------------------------

export interface JourneyValidationIssue {
  level: "error" | "warn";
  rule:
    | "event_before_arrival" // dogodek se začne pred najzgodnejšim možnim prihodom
    | "no_transfer_route" // transfer rute ni bilo mogoče najti
    | "origin_unresolved" // izhodišča ni bilo mogoče geolocirati
    | "dataset_missing"; // KT dataset manjka (okoljska odpoved)
  message: { sl: string; en: string };
}

// ---------------------------------------------------------------------------
// POTOVANJE (izhod orkestratorja — stateless načrt; persistenca =
// SavedItinerary prek obstoječe save poti)
// ---------------------------------------------------------------------------

export interface JourneyPlace {
  /** Kanonska oznaka (npr. „Ljubljana Airport (Brnik)"). */
  label: string;
  lat?: number;
  lng?: number;
  /** Od kod geo: „kiwitaxi-dataset" | „destinations" | unresolved. */
  source: "kiwitaxi-dataset" | "destinations" | "unresolved";
}

export interface JourneyCategoryResult {
  key: JourneyCategoryKey;
  /** Kanonski produkti (transfer/nastanitev/restavracija/bencin/dogodek). */
  products: JourneyProduct[];
  /** Zunanje kategorije (npr. najem): affiliate kartice — NE inventar. */
  providers: {
    provider: ProviderSlug;
    label: { sl: string; en: string };
    /** Tok: /go/... (resnični podprti tok ponudnika). */
    url: string;
    booking: BookingCapability;
    status: "affiliate" | "static" | "local";
    note?: { sl: string; en: string };
  }[];
  /** Iskrena opomba plasti (degraded/empty razlog). */
  note?: { sl: string; en: string };
}

export interface TravelJourney {
  /** ID načrta potovanja (client-side kontekst; pot = SavedItinerary). */
  id: string;
  lang: "sl" | "en";
  origin: JourneyPlace;
  destination: JourneyPlace;
  travelers: number;
  startDate?: string;
  arrivalTime?: string;
  categories: Record<JourneyCategoryKey, JourneyCategoryResult>;
  totals: JourneyTotals;
  validation: { issues: JourneyValidationIssue[] };
  /** Najzgodnejši možen prihod na destinacijo (transfer + ura prihoda). */
  earliestArrivalAtDestination?: { time: string; via: string };
  generatedAt: string;
}
