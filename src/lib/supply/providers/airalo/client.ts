// ============================================================================
// TRAVEL SUPPLY MAP — AIRALO: API KLIENT (Task 53, 1.58.0)
// ============================================================================
// Tenek HTTP klient nad pogodbo Airalo Partner API v2 (eSIM paketi):
//  - auth: OAuth2 client credentials — POST žetonski endpoint s
//    client_id + client_secret (form-encoded) → Bearer žeton
//    [DOCUMENTED; pot "/api/v2/oauth/token" je PORTALNO dokumentirana —
//    sandbox brez poverilnic vrača HTML 404, zato NE preverjena živo:
//    PONOVNO PREVERI ob aktivaciji poverilnic];
//  - žeton PREDPOMNILNIK (v-pomnilniški, deljen med instancami istega
//    procesa): expires_in MINUS 60 s varnostne marže + SINGLE-FLIGHT
//    osvežitev (sočasni klici delijo ENO zahtevo za žeton);
//  - GET /api/v2/countries [LIVE-VERIFIED oblika na sandboxu — GOLI
//    array; s sandboxa deluje TUDI brez žetona, mi žeton pošljemo
//    povsod (dokumentirana praksa vira — produkcija ga zahteva)];
//  - GET /api/v2/packages?country_slug=… [DOCUMENTED-ASSUMPTION —
//    strict validacija: data je seznam];
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic
//    odjemalca se širi do vira — ista pogodba kot ostali adapterji);
//  - klasifikacija napak (unauthorized / rate-limited / forbidden /
//    bad-request / server / network / timeout / aborted /
//    invalid-response) — adapter po njej gradi negativni predpomnilnik;
//  - 429: preberemo Retry-After kadar ga vir poda in ga izpostavimo;
//  - brez internega retry: ponovitev je nadzorovana (negativni
//    predpomnilnik v adapterju; izogibamo se "stormed retry").
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   AIRALO_CLIENT_ID     — OAuth client id (oba izda partnerski portal
//   AIRALO_CLIENT_SECRET — Airalo po odobritvi prijave). MANJKA KATERIKOLI
//                          → plast iskreno izklopljena ("not-configured").
//   AIRALO_API_BASE      — prepiše base URL (sandbox za integracijsko
//                          testiranje: https://sandbox.airalo.com —
//                          LIVE-VERIFIED gostitelj).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

import type {
  AiraloCountryListResponse,
  AiraloPackagesResponse,
  AiraloTokenResponse,
} from "./types";

export const AIRALO_DEFAULT_BASE = "https://api.airalo.com";

/**
 * Pot žetonskega endpointa [DOCUMENTED konstanta — portalno dokumentirana;
 * NE živo preverjena s peskovnika (HTML 404 brez poverilnic) →
 * PONOVNO PREVERI ob aktivaciji].
 */
export const AIRALO_TOKEN_PATH = "/api/v2/oauth/token";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type AiraloErrorKind =
  | "unauthorized" // 401 — napačne/manjkajoče poverilnice (NE ponavljaj 60 s)
  | "forbidden" // 403 — dostop zavrnjen (tier/pravice)
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class AiraloApiError extends Error {
  readonly kind: AiraloErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: AiraloErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "AiraloApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface AiraloClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /** DI (testi); privzeto globalni fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Privzeti časovni proračun enega klica (krajše od runnerjeve dirе). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** Varnostna marža pred potekom žetona (sekunde). */
const TOKEN_MARGIN_SEC = 60;

/** User-Agent z kontaktom (bonton do komercialnega vira z rate limiti). */
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscoverSlovenia/1.0; +https://discoverslovenia.si)";

// ---------------------------------------------------------------------------
// ŽETONSKI PREDPOMNILNIK (modul-nivo — deljen med instancami istega
// procesa; ključ = poverilnice + base, tako da testni/sandbox preklopi
// NIKOLI ne delijo žetona napačne okolja). SINGLE-FLIGHT osvežitev:
// sočasni klici delijo ENO zahtevo za žeton.
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  /** Časovni žig (ms) do katerega je žeton še veljaven (z maržo). */
  expiresAt: number;
}

let cachedToken: { key: string; value: CachedToken } | null = null;
let tokenInflight: { key: string; promise: Promise<CachedToken> } | null =
  null;

/** Testni hak / administracija: pozabi žeton (in letijoči osvežitev). */
export function resetAiraloTokenCache(): void {
  cachedToken = null;
  tokenInflight = null;
}

export class AiraloClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: AiraloClientConfig) {
    const clientId = cfg.clientId.trim();
    const clientSecret = cfg.clientSecret.trim();
    if (!clientId || !clientSecret) {
      throw new AiraloApiError("unauthorized", "empty-credentials");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = (cfg.baseUrl ?? AIRALO_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Ključ žetonskega predpomnilnika (poverilnice + base). */
  private tokenCacheKey(): string {
    return `${this.clientId}|${this.clientSecret}|${this.baseUrl}`;
  }

  /** En klic z dirо + klasifikacijo napak. */
  private async call(
    path: string,
    init: {
      method: "GET" | "POST";
      jsonBody?: unknown;
      formBody?: Record<string, string>;
      headers?: Record<string, string>;
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
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...(init.formBody != null
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(init.jsonBody != null
            ? { "Content-Type": "application/json" }
            : {}),
          ...init.headers,
        },
        ...(init.formBody != null
          ? { body: new URLSearchParams(init.formBody).toString() }
          : {}),
        ...(init.jsonBody != null
          ? { body: JSON.stringify(init.jsonBody) }
          : {}),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) omrežje.
      const aborted = controller.signal.aborted || init.signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new AiraloApiError(
          init.signal?.aborted ? "aborted" : "timeout",
          "aborted"
        );
      }
      throw new AiraloApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new AiraloApiError("rate-limited", "HTTP 429", {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new AiraloApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new AiraloApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new AiraloApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new AiraloApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new AiraloApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new AiraloApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * ŽIVLJENJSKA DOBA ŽETONA: ena zahteva na obdobje veljavnosti (single-
   * flight + predpomnilnik z maržo 60 s). Preklic skupnega poskusa
   * zavrne VSE sočasne klicatelje (ista semantika coalescinga kot
   * adapterji — naslednji poskus znova zahteva žeton).
   */
  private async requestNewToken(signal?: AbortSignal): Promise<CachedToken> {
    const raw = await this.call(AIRALO_TOKEN_PATH, {
      method: "POST",
      formBody: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
      },
      signal,
    });
    const body = (raw ?? {}) as Partial<AiraloTokenResponse>;
    const data = body.data;
    const token = data?.access_token;
    const expiresIn = data?.expires_in;
    if (
      !data ||
      typeof token !== "string" ||
      token.trim().length === 0 ||
      token.length > 4096 ||
      typeof expiresIn !== "number" ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new AiraloApiError("invalid-response", "token-shape");
    }
    // Marža 60 s (žeton NE poteče sredi klica); min 1 s življenjske dobe.
    const ttlMs = Math.max(1_000, (expiresIn - TOKEN_MARGIN_SEC) * 1000);
    return { token, expiresAt: Date.now() + ttlMs };
  }

  /** Veljaven Bearer žeton (iz predpomnilnika ali single-flight osvežitve). */
  async getAccessToken(signal?: AbortSignal): Promise<string> {
    const key = this.tokenCacheKey();
    if (
      cachedToken &&
      cachedToken.key === key &&
      Date.now() < cachedToken.value.expiresAt
    ) {
      return cachedToken.value.token;
    }
    if (tokenInflight && tokenInflight.key === key) {
      return (await tokenInflight.promise).token;
    }
    const promise = this.requestNewToken(signal);
    tokenInflight = { key, promise };
    try {
      const value = await promise;
      cachedToken = { key, value };
      return value.token;
    } finally {
      if (tokenInflight !== null && tokenInflight.promise === promise) {
        tokenInflight = null;
      }
    }
  }

  /**
   * GET /api/v2/countries — GOLI JSON seznam [LIVE-VERIFIED oblika na
   * sandboxu]. Validacija: odgovor je seznam (elemente obrambno preveri
   * adapter/mapper). Žeton pošljemo povsod (dokumentirana praksa vira).
   */
  async getCountries(
    opts: { signal?: AbortSignal } = {}
  ): Promise<AiraloCountryListResponse> {
    const token = await this.getAccessToken(opts.signal);
    const raw = await this.call("/api/v2/countries", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: opts.signal,
    });
    if (!Array.isArray(raw)) {
      throw new AiraloApiError("invalid-response", "countries-shape");
    }
    return raw as AiraloCountryListResponse;
  }

  /**
   * GET /api/v2/packages?country_slug=… — STRICT validacija oblike
   * [DOCUMENTED-ASSUMPTION]: odgovor MORA biti objekt s seznamom data
   * (sicer invalid-response → negativni predpomnilnik v adapterju).
   */
  async getPackages(
    countrySlug: string,
    opts: { signal?: AbortSignal } = {}
  ): Promise<AiraloPackagesResponse> {
    const token = await this.getAccessToken(opts.signal);
    const raw = await this.call(
      `/api/v2/packages?country_slug=${encodeURIComponent(countrySlug)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: opts.signal,
      }
    );
    const body = raw as { data?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray(body.data)
    ) {
      throw new AiraloApiError("invalid-response", "packages-shape");
    }
    return raw as AiraloPackagesResponse;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; vrednosti NIKOLI v klient — samo
// strežniški route handlerji vidijo dejanske poverilnice)
// ---------------------------------------------------------------------------

/** Poverilnice (strežniško) ali null — OBE sta OBVEZNI. */
export function airaloCredentialsFromEnv(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.AIRALO_CLIENT_ID?.trim();
  const clientSecret = process.env.AIRALO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Base URL iz env (sandbox preklop) ali produkcija (brez končnih /). */
export function airaloBaseUrlFromEnv(): string {
  const base = process.env.AIRALO_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : AIRALO_DEFAULT_BASE;
}
