// ============================================================================
// TRAVEL SUPPLY MAP — SKYSCANNER: API KLIENT (Task 53, 1.58.0)
// ============================================================================
// Tenek HTTP klient nad javno dokumentirano pogodbo Skyscanner Travel API
// v3 (Flights Live Prices — dvostopna asinhrona iskanja):
//  - glave: x-api-key + Accept: application/json + Content-Type pri POST
//    [DOCUMENTED — developers.skyscanner.net];
//  - LIVE-VERIFIED (19. 9. 2026): POST /flights/live/search/create brez
//    ključa → HTTP 403 "Request Forbidden" (vrata živa — gate v adapterju
//    po tej预 precizni klasifikaciji ni nikoli lažno zelen);
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic odjemalca
//    se širi do vira — ista pogodba kot OSM/Viator/GYG adapterji);
//  - klasifikacija napak (unauthorized / rate-limited / forbidden /
//    bad-request / server / network / timeout / aborted / invalid-response)
//    — adapter po njej gradi negativni predpomnilnik (vzorec Task 44-b);
//  - 429: preberemo Retry-After kadar ga vir poda in ga izpostavimo;
//    NE potrjujemo sami — odločitev je v adapterju (negativni cache);
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni predpomnilnik); izogibamo se "stormed retry" vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   SKYSCANNER_API_KEY  — ključ partnerja (izda partners.skyscanner.net po
//                         oddaji prijave — PARTNER APPROVAL, NI self-serve).
//                         BREZ ključa je plast iskreno izklopljena
//                         (adapter: "not-configured").
//   SKYSCANNER_API_BASE — prepiše base URL (integracijsko testiranje).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

import type { SkyscannerLiveSearchRequest, SkyscannerPollResponse } from "./types";

export const SKYSCANNER_DEFAULT_BASE =
  "https://partners.skyscanner.net/apiservices/v3";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type SkyscannerErrorKind =
  | "unauthorized" // 401 — napačen/manjka ključ (NE ponavljaj 60 s)
  | "forbidden" // 403 — vrata živa (živi dokaz: brez ključa = 403!)
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class SkyscannerApiError extends Error {
  readonly kind: SkyscannerErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: SkyscannerErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "SkyscannerApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface SkyscannerClientConfig {
  apiKey: string;
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

export class SkyscannerClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: SkyscannerClientConfig) {
    const key = cfg.apiKey.trim();
    if (!key) throw new SkyscannerApiError("unauthorized", "empty-api-key");
    this.apiKey = key;
    this.baseUrl = (cfg.baseUrl ?? SKYSCANNER_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Skupne glave (pogodba: x-api-key na VSAKEM klicu). */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  /** En POST klic z dirо + klasifikacijo napak. */
  private async call(
    path: string,
    init: { body?: unknown; signal?: AbortSignal }
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
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(init.body ?? {}),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) omrežje.
      const aborted = controller.signal.aborted || init.signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new SkyscannerApiError(
          init.signal?.aborted ? "aborted" : "timeout",
          "aborted"
        );
      }
      throw new SkyscannerApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new SkyscannerApiError("rate-limited", "HTTP 429", {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new SkyscannerApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new SkyscannerApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new SkyscannerApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new SkyscannerApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new SkyscannerApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new SkyscannerApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * KORAK 1 pogodbe: POST /flights/live/search/create → session token.
   * (Validacija: session_token je neprazen niz — sicer invalid-response;
   * brez žetona NI iskanja, NE nadaljujemo na poll.)
   */
  async createLiveSearch(
    req: SkyscannerLiveSearchRequest,
    opts: { signal?: AbortSignal } = {}
  ): Promise<string> {
    const raw = await this.call("/flights/live/search/create", {
      body: req,
      signal: opts.signal,
    });
    const body = raw as { session_token?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.session_token !== "string" ||
      body.session_token.trim().length === 0 ||
      body.session_token.length > 500
    ) {
      throw new SkyscannerApiError("invalid-response", "create-shape");
    }
    return body.session_token;
  }

  /**
   * KORAK 2 pogodbe: POST /flights/live/search/poll/{session_token}
   * (telo {} po dokumentaciji) → SUROV poll odgovor. Validiramo SAMO
   * kritično obliko: itineraries je seznam (status/next_action sta
   * odločitveni polji adapterja — ne-JSON in brez seznama = odpoved).
   */
  async pollLiveSearch(
    sessionToken: string,
    opts: { signal?: AbortSignal } = {}
  ): Promise<SkyscannerPollResponse> {
    const raw = await this.call(
      `/flights/live/search/poll/${encodeURIComponent(sessionToken)}`,
      { body: {}, signal: opts.signal }
    );
    const body = raw as { itineraries?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray(body.itineraries)
    ) {
      throw new SkyscannerApiError("invalid-response", "poll-shape");
    }
    return raw as SkyscannerPollResponse;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; vrednosti NIKOLI v klient — samo
// strežniški route handlerji vidijo dejanski ključ)
// ---------------------------------------------------------------------------

/** Dejanski ključ (strežniško) ali null, če NI konfiguriran. */
export function skyscannerApiKeyFromEnv(): string | null {
  const key = process.env.SKYSCANNER_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/** Base URL iz env (prepis za integracijsko testiranje) ali produkcija. */
export function skyscannerBaseUrlFromEnv(): string {
  const base = process.env.SKYSCANNER_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : SKYSCANNER_DEFAULT_BASE;
}
