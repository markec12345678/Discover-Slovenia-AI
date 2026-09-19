// ============================================================================
// TRAVEL SUPPLY MAP — TRAVELPAYOUTS: API KLIENT (TASK 53, 1.58.0)
// ============================================================================
// Tenek HTTP klient nad JAVNO DOKUMENTIRANO pogodbo Travelpayouts Data API:
//  - LIVE-VERIFIED (curl, 19. 9. 2026): brez žetona endpoint
//    /aviasales/v3/prices_for_dates odgovori HTTP 401 „Unauthorized“ —
//    vrata so živa in odklonijo nepooblaščene klice;
//  - auth (DOCUMENTED): žeton v glavi „X-Access-Token“ (alternativa query
//    parametra „token“ namenoma NE uporabljena — žeton ne sme priti v
//    URL/dnevnike);
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic odjemalca
//    se širi do vira — ista pogodba kot viator/gyg klienta);
//  - klasifikacija napak (unauthorized / rate-limited / forbidden /
//    bad-request / server / network / timeout / aborted / invalid-response)
//    — adapter po njej gradi negativni predpomnilnik (vzorec Task 44-b:
//    okvara ključa se zapomni 60 s, 429 dlje če Retry-After naroči);
//  - 429: preberemo Retry-After in ga izpostavimo (NE potrjujemo sami —
//    odločitev je v adapterju);
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni cache); izogibamo se „stormed retry“ vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   TRAVELPAYOUTS_TOKEN     — API žeton (self-serve: registracija računa →
//                             travelpayouts.com/developers/api). BREZ žetona
//                             je plast iskreno izklopljena („not-configured“).
//   TRAVELPAYOUTS_API_BASE  — prepiše base URL (privzeto produkcija).
//   TRAVELPAYOUTS_ORIGIN    — IATA izhodiščnega letališča (glej spodaj
//                             „PRODUCT GAP“ v adapter.ts).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

import type {
  TravelpayoutsPricesParams,
  TravelpayoutsPricesResponse,
} from "./types";

export const TRAVELPAYOUTS_DEFAULT_BASE = "https://api.travelpayouts.com";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type TravelpayoutsErrorKind =
  | "unauthorized" // 401 — napačen/manjka žeton (NE ponavljaj 60 s)
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "forbidden" // 403 — račun nima dostopa do endpointa
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class TravelpayoutsApiError extends Error {
  readonly kind: TravelpayoutsErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: TravelpayoutsErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "TravelpayoutsApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface TravelpayoutsClientConfig {
  token: string;
  baseUrl?: string;
  /** DI (testi); privzeto globalni fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Privzeti časovni proračun enega klica (krajše od runnerjeve dirе). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** User-Agent z kontaktom (bonton do komercialnega vira z rate limiti). */
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscoverSlovenia/1.0; +https://discoverslovenia.si)";

export class TravelpayoutsClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: TravelpayoutsClientConfig) {
    const token = cfg.token.trim();
    if (!token) throw new TravelpayoutsApiError("unauthorized", "empty-api-token");
    this.token = token;
    this.baseUrl = (cfg.baseUrl ?? TRAVELPAYOUTS_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Skupne glave (pogodba: žeton v X-Access-Token glavi). */
  private headers(): Record<string, string> {
    return {
      "X-Access-Token": this.token,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
  }

  /** En klic z dirо + klasifikacijo napak (isti vzorec kot viator klient). */
  private async call(
    path: string,
    init: { query: Record<string, string>; signal?: AbortSignal }
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}?${new URLSearchParams(init.query).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Zunanji preklic (odjemalčev signal) prekine tudi ta klic.
    const onOuterAbort = () => controller.abort();
    init.signal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) od omrežja.
      const aborted = controller.signal.aborted || init.signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new TravelpayoutsApiError(
          init.signal?.aborted ? "aborted" : "timeout",
          "aborted"
        );
      }
      throw new TravelpayoutsApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new TravelpayoutsApiError("rate-limited", "HTTP 429", {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new TravelpayoutsApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new TravelpayoutsApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new TravelpayoutsApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new TravelpayoutsApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new TravelpayoutsApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new TravelpayoutsApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * GET /aviasales/v3/prices_for_dates — predpomnjene najnižje cene letov
   * za smer (DOCUMENTED; LIVE-VERIFIED vrata: 401 brez žetona).
   * Validacija oblike: success === true + data array — sicer
   * invalid-response (NE izmišljujemo podatkov).
   */
  async getPricesForDates(
    params: TravelpayoutsPricesParams,
    opts: { signal?: AbortSignal } = {}
  ): Promise<TravelpayoutsPricesResponse> {
    const query: Record<string, string> = {
      origin: params.origin,
      destination: params.destination,
      currency: params.currency,
      one_way: String(params.one_way),
      sorting: params.sorting,
      limit: String(params.limit),
      ...(params.departure_at ? { departure_at: params.departure_at } : {}),
    };
    const raw = await this.call("/aviasales/v3/prices_for_dates", {
      query,
      signal: opts.signal,
    });
    const body = raw as Partial<TravelpayoutsPricesResponse>;
    if (
      !body ||
      typeof body !== "object" ||
      body.success !== true ||
      !Array.isArray(body.data)
    ) {
      throw new TravelpayoutsApiError("invalid-response", "prices-shape");
    }
    return body as TravelpayoutsPricesResponse;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; klient-varno — vrednosti žetona NIKOLI
// ne zapustijo strežniške plasti)
// ---------------------------------------------------------------------------

/** Dejanski žeton (strežniško) ali null, če NI konfiguriran. */
export function travelpayoutsTokenFromEnv(): string | null {
  const token = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * IATA izhodiščno letališče (strežniško) ali null — glej „PRODUCT GAP“
 * v adapter.ts: SupplyQuery NIMA izvornega letališča, zato je izhodišče
 * IZRECNA operaterska konfiguracija (TRAVELPAYOUTS_ORIGIN, npr. „LJU“).
 * BREZ nje je plast iskreno prazna („origin-required“) — NE sklepamo
 * privzetka (domnevati „LJU“ bi pomenilo tiho izmišljanje trga uporabnikov).
 */
export function travelpayoutsOriginFromEnv(): string | null {
  const origin = process.env.TRAVELPAYOUTS_ORIGIN?.trim().toUpperCase();
  return origin && /^[A-Z]{3}$/.test(origin) ? origin : null;
}

/** Base URL iz env ali produkcija (brez končnih /). */
export function travelpayoutsBaseUrlFromEnv(): string {
  const base = process.env.TRAVELPAYOUTS_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : TRAVELPAYOUTS_DEFAULT_BASE;
}
