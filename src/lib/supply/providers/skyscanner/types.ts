// ============================================================================
// TRAVEL SUPPLY MAP — SKYSCANNER: POGODBENE VRSTE (Task 53, 1.58.0)
// ============================================================================
// VRSTE SO PRESLIKAVE IZ JAVNE DOKUMENTACIJE Skyscanner Travel API v3
// (developers.skyscanner.net — Flights Live Prices). Polja, ki jih javna
// dokumentacija ne definira, so OPCIJSKA — nikoli jih ne izmišljujemo.
//
// POGODBA (stanje preverbe, 19. 9. 2026):
//  - Base:    https://partners.skyscanner.net/apiservices/v3
//    [LIVE-VERIFIED: POST /flights/live/search/create brez ključa →
//    HTTP 403 "Request Forbidden" — vrata ŽIVA; goli host 301 preusmeri
//    na www.partners.skyscanner.net, fetch sledi preusmeritvi sam]
//  - Auth:    glava "x-api-key" na vsakem klicu [DOCUMENTED — javni,
//    stabilen, splošno znan iz developers.skyscanner.net/docs]
//  - Dostop:  API ključe izda partners.skyscanner.net PO oddaji prijave
//    (PARTNER APPROVAL — NI self-serve) → brez ključa plast iskreno
//    prazna ("not-configured" v adapterju)
//  - Flights Live Prices: DVOSTOPNA asinhrona pogodba [DOCUMENTED]:
//      1) POST /flights/live/search/create  {"query": {...}} →
//         {"session_token": "...", "status": "..."}
//      2) POST /flights/live/search/poll/{session_token}  telo {} →
//         {"status": "RESULT_STATUS_COMPLETE", "next_action": {...},
//          "itineraries": [...], "legs": [...], "places": [...],
//          "carriers": [...]}
//  - Place ID format ("lju-sky" stil IATA-sky): DOCUMENTED-ASSUMPTION —
//    iz javnih primerov dokumentacije; PONOVNO PREVERI prek
//    autosuggest/places endpointa ob aktivaciji ključa.
// ============================================================================

/** Referenčna oblika place id (IATA-sky) — meja zaupanja za vhod. */
export const SKYSCANNER_PLACE_ID_RE = /^[A-Za-z0-9_-]{2,32}$/;

/** Leg (letalska etapa) iz poll odgovora. */
export interface SkyscannerLeg {
  id?: string;
  origin_place_id?: string;
  destination_place_id?: string;
  departure_date_time?: string;
  arrival_date_time?: string;
  /** Id-ji prevoznikov (razrešijo se prek carriers[]). */
  carriers?: string[];
  /** Trajanje v minutah (dokumentirano polje). */
  duration?: number;
  stop_count?: number;
}

/** Place (letališče/mesto) iz poll odgovora. */
export interface SkyscannerPlace {
  id?: string;
  name?: string;
  /** Npr. "Airport" | "City" (dokumentirane vrste). */
  type?: string;
  coordinates?: { latitude?: number; longitude?: number };
  iata_code?: string;
}

/** Prevoznik iz poll odgovora. */
export interface SkyscannerCarrier {
  id?: string;
  name?: string;
}

/** Pricing option itinererja (prva = najnižja — vir razvršča). */
export interface SkyscannerPricingOption {
  price?: { amount?: number; unit_type?: string };
  agent_id?: string;
  /** Globoka povezava na živo ceno pri ponudniku (https). */
  deep_link?: string;
}

/** Itinerary (ponudba leta) iz poll odgovora. */
export interface SkyscannerItinerary {
  id: string;
  leg_ids?: string[];
  pricing_options?: SkyscannerPricingOption[];
}

/** POST /flights/live/search/create — zahteva (pogodbeno telo vira). */
export interface SkyscannerLiveSearchRequest {
  query: {
    market: string;
    locale: string;
    currency: string;
    outbound_leg: {
      origin_place_id: string;
      destination_place_id: string;
      /** YYYY-MM-DD. */
      date: string;
    };
    inbound_leg?: {
      origin_place_id: string;
      destination_place_id: string;
      date: string;
    };
    adults: number;
    cabin_class: string;
  };
}

/** POST /flights/live/search/create — odgovor (session token). */
export interface SkyscannerCreateResponse {
  session_token?: string;
  status?: string;
}

/** POST /flights/live/search/poll/{token} — odgovor (žive cene). */
export interface SkyscannerPollResponse {
  status?: string;
  next_action?: unknown;
  itineraries?: SkyscannerItinerary[];
  legs?: SkyscannerLeg[];
  places?: SkyscannerPlace[];
  carriers?: SkyscannerCarrier[];
}

/** Status dokončnosti poll odgovora (pogodbena konstanta vira). */
export const SKYSCANNER_RESULT_COMPLETE = "RESULT_STATUS_COMPLETE";

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/types.ts — en slab
// zapis NE sme podreti celotne plasti; §22 meja zaupanja na VHODU)
// ---------------------------------------------------------------------------

/**
 * Veljaven place id vira (IATA-sky stil): alfanumerični/črtica/podčrtaj,
 * 2–32 znakov. Zavrnemo prazne/URL-metaznake/predolge vrednosti —
 * nikoli ne gredo nepreverjene v pogodbeno telo.
 */
export function isSkyscannerPlaceId(v: unknown): v is string {
  return typeof v === "string" && SKYSCANNER_PLACE_ID_RE.test(v);
}

/**
 * Minimalna veljavnost itinererja: id (neprazen, sanitiziran nabor).
 * Naslov produkta se izpelje IZKLJUČNO iz legs/places vira — če se ne
 * razreši, mapper zapis preskoči (fail-closed, NE izmišljuje naslova).
 */
export function isSkyscannerItinerary(v: unknown): v is SkyscannerItinerary {
  if (!v || typeof v !== "object") return false;
  const it = v as Partial<SkyscannerItinerary>;
  return (
    typeof it.id === "string" &&
    it.id.trim().length > 0 &&
    it.id.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(it.id)
  );
}
