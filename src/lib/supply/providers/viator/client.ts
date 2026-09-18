// ============================================================================
// TRAVEL SUPPLY MAP — VIATOR: API KLIENT (Task 45, 1.50.0)
// ============================================================================
// Tenek HTTP klient nad ŽIVO preverjeno pogodbo Viator Partner API v2.0:
//  - glave: exp-api-key + Accept: application/json;version=2.0 (OBVEZNO)
//    + Accept-Language (en-US — sl-SI vir ne podpira, dokumentirano) +
//    Content-Type: application/json pri POST;
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic odjemalca
//    se širi do vira — ista pogodba kot OSM adapter);
//  - klasifikacija napak (unauthorized / rate-limited / server / network /
//    timeout / invalid-response) — adapter po njej gradi negativni
//    predpomnilnik (vzorec Task 44-b: okvara ključa se zapomni 60 s, vir
//    NE dobija zaporednih klicev);
//  - 429: preberemo Retry-After (pogodba vira: "read it from the response
//    rather than assuming a fixed interval") in ga izpostavimo; NE
//    potrjujemo sami — odločitev je v adapterju (negativni cache).
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni cache); izogibamo se " stormed retry" vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   VIATOR_API_KEY  — ključ organizacije (self-serve: partnerski račun →
//                     Tools → Affiliate API → Start your development;
//                     uradni Golden Path). BREZ ključa je plast iskreno
//                     izklopljena (adapter: "not-configured").
//   VIATOR_API_BASE — prepiše base URL (sandbox integracija:
//                     https://api.sandbox.viator.com/partner).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

import type {
  ViatorDestinationsResponse,
  ViatorDestination,
  ViatorSearchRequest,
  ViatorSearchResponse,
} from "./types";

export const VIATOR_DEFAULT_BASE = "https://api.viator.com/partner";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type ViatorErrorKind =
  | "unauthorized" // 401 — napačen/manjka ključ (NE ponavljaj 60 s)
  | "forbidden" // 403 — tier nima dostopa do endpointa
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class ViatorApiError extends Error {
  readonly kind: ViatorErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: ViatorErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "ViatorApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface ViatorClientConfig {
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

export class ViatorClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: ViatorClientConfig) {
    const key = cfg.apiKey.trim();
    if (!key) throw new ViatorApiError("unauthorized", "empty-api-key");
    this.apiKey = key;
    this.baseUrl = (cfg.baseUrl ?? VIATOR_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Skupne glave (pogodba: verzija v Accept je OBVEZNA). */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "exp-api-key": this.apiKey,
      Accept: "application/json;version=2.0",
      "Accept-Language": "en-US",
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  /** En klic z dirо + klasifikacijo napak. */
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
        throw new ViatorApiError(
          init.signal?.aborted ? "aborted" : "timeout",
          "aborted"
        );
      }
      throw new ViatorApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new ViatorApiError("rate-limited", `HTTP 429`, {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new ViatorApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new ViatorApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new ViatorApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new ViatorApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new ViatorApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new ViatorApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * POST /products/search — povzetki produktov po destinaciji.
   * (Pogodba: NE za ingest kataloga — samo za uporabniške poizvedbe;
   * vrača SAMO aktivne produkte.)
   */
  async searchProducts(
    req: ViatorSearchRequest,
    opts: { signal?: AbortSignal } = {}
  ): Promise<ViatorSearchResponse> {
    const raw = await this.call("/products/search", {
      method: "POST",
      body: req,
      signal: opts.signal,
    });
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as { products?: unknown }).products)) {
      throw new ViatorApiError("invalid-response", "search-shape");
    }
    return raw as ViatorSearchResponse;
  }

  /**
   * GET /destinations — CELA taksonomija destinacij.
   * (Pogodba: osveževanje tedensko; uporabljamo za razreševanje
   * destinations[].ref v produktih.)
   */
  async getDestinations(
    opts: { signal?: AbortSignal } = {}
  ): Promise<ViatorDestination[]> {
    const raw = await this.call("/destinations", {
      method: "GET",
      signal: opts.signal,
    });
    const body = raw as Partial<ViatorDestinationsResponse>;
    if (!body || !Array.isArray(body.destinations)) {
      throw new ViatorApiError("invalid-response", "destinations-shape");
    }
    return body.destinations;
  }

  /**
   * GET /products/{product-code} — podrobnosti (živi productUrl za /go
   * deep-link ob hladnem zagonu). Obrambno: preverimo samo polja, ki jih
   * uporabljamo.
   */
  async getProduct(
    productCode: string,
    opts: { signal?: AbortSignal } = {}
  ): Promise<{ productUrl?: string; title?: string }> {
    const raw = await this.call(`/products/${encodeURIComponent(productCode)}`, {
      method: "GET",
      signal: opts.signal,
    });
    if (!raw || typeof raw !== "object") {
      throw new ViatorApiError("invalid-response", "product-shape");
    }
    const p = raw as { productUrl?: unknown; title?: unknown };
    return {
      productUrl: typeof p.productUrl === "string" ? p.productUrl : undefined,
      title: typeof p.title === "string" ? p.title : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; klient-varno — samo boolean/dejanski
// klient ostaja v route handlerjih)
// ---------------------------------------------------------------------------

/** Dejanski ključ (strežniško) ali null, če NI konfiguriran. */
export function viatorApiKeyFromEnv(): string | null {
  const key = process.env.VIATOR_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/** Base URL iz env (sandbox preklop) ali produkcija (brez končnih /). */
export function viatorBaseUrlFromEnv(): string {
  const base = process.env.VIATOR_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : VIATOR_DEFAULT_BASE;
}
