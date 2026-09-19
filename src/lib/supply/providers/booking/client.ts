// ============================================================================
// TRAVEL SUPPLY MAP — BOOKING: API KLIENT (Task 53)
// ============================================================================
// Tenek HTTP klient nad BOOKING.COM DEMAND API v3 (demand.booking.com).
//
// POGODBA (javno dokumentirana — developers.booking.com/demand/docs):
//  - Dostop: status „Managed Affiliate Partner" (pogodba) — ključ izda
//    Booking po odobritvi. BREZ ključa je plast iskreno izklopljena
//    (adapter: "not-configured").
//  - Auth: glava "Booking-API-Key" — DOCUMENTED-ASSUMPTION po javni
//    dokumentaciji; ob aktivaciji PONOVNO preveri (portal je JS-renderan,
//    sandbox host pa je iz našega peskovnika DNS-blokiran — to je
//    OMEJITEV PESKOVNIKA, ne pogodbeno dejstvo).
//  - ISKANJE: GET /v3/accommodations/search?bbox=<west,south,east,north>&
//    checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=<pax>&room_quantity=1&
//    currency=EUR&locale=en-us → {"data": […], …}
//    (POZOR: bbox vrstni red vira je west,south,east,north — adapter
//    pretvarja iz našega [south,west,north,east]).
//  - CENE: POST /v3/accommodations/rates {"accommodations_ids": […],
//    "checkin": …, "checkout": …, "adults": …, "currency": "EUR"} →
//    bloki cen po nastanitvi.
//
// OSTALO (isti vzorec kot Viator/GYG/Tiqets klient):
//  - timeout (privzeto 8 s na klic; adapter izvede 2 klica: iskanje +
//    EN batch rates) + posredovanje AbortSignal;
//  - klasifikacija napak (unauthorized / rate-limited / forbidden /
//    bad-request / server / network / timeout / aborted /
//    invalid-response) — adapter po njej gradi negativni predpomnilnik
//    (60 s, vzorec Task 44-b);
//  - 429: preberemo Retry-After kadar je podan (izpostavimo ga; adapter
//    NE potrjuje sam — odločitev v negativnem predpomnilniku);
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni predpomnilnik); izogibamo se "stormed retry" vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   BOOKING_API_KEY  — Demand API ključ (Managed Affiliate Partner).
//   BOOKING_API_BASE — NEOBVEZEN preklop baze (privzeto
//                      https://demand.booking.com; za testne integracije
//                      ob aktivaciji).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

export const BOOKING_DEFAULT_BASE = "https://demand.booking.com";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type BookingErrorKind =
  | "unauthorized" // 401 — napačen/manjka ključ
  | "forbidden" // 403 — račun nima dostopa (status partnerja)
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class BookingApiError extends Error {
  readonly kind: BookingErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: BookingErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "BookingApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface BookingClientConfig {
  apiKey: string;
  baseUrl?: string;
  /** DI (testi); privzeto globalni fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Privzeti časovni proračun enega klica (krajši od runnerjeve dirе). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** User-Agent z kontaktom (bonton do komercialnega vira z rate limiti). */
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscoverSlovenia/1.0; +https://discoverslovenia.si)";

/** Parametri iskanja nastanitev (dokumentirana oblika endpointa). */
export interface BookingSearchParams {
  /**
   * [west, south, east, north] — POGODBENI vrstni red VIRA ( naš
   * SupplyQuery bbox je [south, west, north, east]; pretvorba je v
   * adapter.ts bookingBboxFromSupply — TUKAJ prihajajo že pretvorjeni).
   */
  bbox: [number, number, number, number];
  checkin: string;
  checkout: string;
  adults: number;
}

/** Parametri zahtevka cen (dokumentirano telo POST /rates). */
export interface BookingRatesParams {
  accommodationIds: string[];
  checkin: string;
  checkout: string;
  adults: number;
}

export class BookingClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: BookingClientConfig) {
    const key = cfg.apiKey.trim();
    if (!key) throw new BookingApiError("unauthorized", "empty-api-key");
    this.apiKey = key;
    this.baseUrl = (cfg.baseUrl ?? BOOKING_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /**
   * Skupne glave. IME GLAVE "Booking-API-Key" je DOCUMENTED-ASSUMPTION po
   * javni dokumentaciji — PONOVNO preveri ob aktivaciji. Vrednost ključa
   * zapušča proces SAMO v tej glavi (nikoli v URL/query — logi čisti).
   */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "Booking-API-Key": this.apiKey,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  /** En klic z dirо + klasifikacijo napak (GET ali POST s telesom). */
  private async call(
    path: string,
    init: {
      method: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
    }
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Zunanji preklic (odjemalčev signal) prekine tudi ta klic.
    const onOuterAbort = () => controller.abort();
    init.signal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: init.method,
        headers: this.headers(
          init.body != null ? { "Content-Type": "application/json" } : undefined
        ),
        ...(init.body != null ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) omrežje.
      const aborted = controller.signal.aborted || init.signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new BookingApiError(
          init.signal?.aborted ? "aborted" : "timeout",
          "aborted"
        );
      }
      throw new BookingApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new BookingApiError("rate-limited", "HTTP 429", {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new BookingApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new BookingApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new BookingApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new BookingApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new BookingApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new BookingApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * GET /v3/accommodations/search — nastanitve po bbox + okno datuma.
   * Parametri PO POGODBI: bbox (west,south,east,north), checkin, checkout,
   * adults, room_quantity=1, currency=EUR, locale=en-us (dokumentirana
   * kombinacija; ostale izbirne parametre NE pošiljamo — ne ugibamo).
   * Ovojnica: {"data": […]} — vse ostalo → invalid-response (fail-closed).
   */
  async searchAccommodations(
    p: BookingSearchParams,
    opts: { signal?: AbortSignal } = {}
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    // POZOR: vrstni red vira je west,south,east,north (p.bbox ŽE pretvorjen
    // iz našega [south,west,north,east] v adapterju).
    params.set("bbox", `${p.bbox[0]},${p.bbox[1]},${p.bbox[2]},${p.bbox[3]}`);
    params.set("checkin", p.checkin);
    params.set("checkout", p.checkout);
    params.set("adults", String(p.adults));
    params.set("room_quantity", "1");
    params.set("currency", "EUR");
    params.set("locale", "en-us");

    const raw = await this.call(
      `/v3/accommodations/search?${params.toString()}`,
      {
        method: "GET",
        signal: opts.signal,
      }
    );
    const body = raw as { data?: unknown };
    if (!body || typeof body !== "object" || !Array.isArray(body.data)) {
      throw new BookingApiError("invalid-response", "search-shape");
    }
    return body.data;
  }

  /**
   * POST /v3/accommodations/rates — cene (bloki) za SEZNAM ID-jev
   * nastanitev v enem klicu (batch). Telo PO POGODBI:
   * {"accommodations_ids": […], "checkin", "checkout", "adults",
   *  "currency": "EUR"}. Ovojnica: {"data": […]} — vse ostalo →
   * invalid-response (fail-closed).
   */
  async requestRates(
    p: BookingRatesParams,
    opts: { signal?: AbortSignal } = {}
  ): Promise<unknown[]> {
    const raw = await this.call("/v3/accommodations/rates", {
      method: "POST",
      body: {
        accommodations_ids: p.accommodationIds,
        checkin: p.checkin,
        checkout: p.checkout,
        adults: p.adults,
        currency: "EUR",
      },
      signal: opts.signal,
    });
    const body = raw as { data?: unknown };
    if (!body || typeof body !== "object" || !Array.isArray(body.data)) {
      throw new BookingApiError("invalid-response", "rates-shape");
    }
    return body.data;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; klient-varno — samo boolean/dejanski
// klient ostaja v route handlerjih)
// ---------------------------------------------------------------------------

/** Dejanski ključ (strežniško) ali null, če NI konfiguriran. */
export function bookingApiKeyFromEnv(): string | null {
  const key = process.env.BOOKING_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/** Base URL iz env (test preklop) ali produkcija (brez končnih /). */
export function bookingBaseUrlFromEnv(): string {
  const base = process.env.BOOKING_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : BOOKING_DEFAULT_BASE;
}
