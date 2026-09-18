// ============================================================================
// TRAVEL SUPPLY MAP — GETYOURGUIDE: API KLIENT (Task 46, 1.51.0)
// ============================================================================
// Tenek HTTP klient nad ŽIVO preverjeno pogodbo GetYourGuide Partner API:
//  - glave: X-ACCESS-TOKEN + Accept: application/json (OBVEZNO, wiki
//    Getting-started — živi dokaz brez žetona: HTTP 401 errorCode 2420);
//  - verzija v POTI: /1/ (wiki: "currently only 1 is available");
//  - vsak GET nosi currency + cnt_language (stateless pogodba vira);
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic odjemalca
//    se širi do vira — ista pogodba kot OSM/Viator adapterja);
//  - klasifikacija napak (unauthorized / rate-limited / server / network /
//    timeout / aborted / invalid-response) — adapter po njej gradi negativni
//    predpomnilnik (429 = dokumentirana 5-minutna blokada vira → 310 s);
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni predpomnilnik); izogibamo se "stormed retry" vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   GETYOURGUIDE_API_TOKEN — API access token (izda partner manager /
//                     partner.getyourguide.com po odobritvi dostopa).
//                     BREZ žetona je plast iskreno izklopljena
//                     (adapter: "not-configured").
//   GETYOURGUIDE_API_BASE  — prepiše base URL (test integracija:
//                     https://api.gygtest.net — uradni test strežnik iz
//                     OpenAPI specifikacije servers).
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

import type { GygToursResponse } from "./types";

export const GYG_DEFAULT_BASE = "https://api.getyourguide.com";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type GygErrorKind =
  | "unauthorized" // 401 — napačen/manjka žeton (errorCode 2420)
  | "rate-limited" // 429 — vir blokira nadaljnje klice 5 MINUT (dokumentirano)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "not-found" // 404 — neznan tour_id pri produktu
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika

export class GygApiError extends Error {
  readonly kind: GygErrorKind;
  readonly status?: number;

  constructor(
    kind: GygErrorKind,
    message: string,
    opts: { status?: number } = {}
  ) {
    super(message);
    this.name = "GygApiError";
    this.kind = kind;
    this.status = opts.status;
  }
}

export interface GygClientConfig {
  apiToken: string;
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

/** Parametri iskanja (mapirajo se na pogodbene query parametre vira). */
export interface GygToursSearchParams {
  /** [lat, lng, radius] — pogodbena coordinates[] matrika (NE gzipana). */
  coordinates: [number, number, number];
  /** ISO datum (YYYY-MM-DD) ali null — vir: date[] okno »offered on date«. */
  date?: string | null;
  /** Št. rezultatov (spec: limit 1–500, default 10). */
  limit: number;
  /** Sortiranje vira (default "popularity" — njihovo priporočilo). */
  sortfield?: string;
}

export class GygClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: GygClientConfig) {
    const token = cfg.apiToken.trim();
    if (!token) throw new GygApiError("unauthorized", "empty-api-token");
    this.apiToken = token;
    this.baseUrl = (cfg.baseUrl ?? GYG_DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Skupne glave (pogodba: X-ACCESS-TOKEN + Accept application/json). */
  private headers(): Record<string, string> {
    return {
      "X-ACCESS-TOKEN": this.apiToken,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
  }

  /** En GET klic z dirо + klasifikacijo napak. */
  private async get(
    path: string,
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Zunanji preklic (odjemalčev signal) prekine tudi ta klic.
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) omrežje.
      const aborted = controller.signal.aborted || signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new GygApiError(signal?.aborted ? "aborted" : "timeout", "aborted");
      }
      throw new GygApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      // Pogodba vira: ob presegu (130/min) so vsi nadaljnji klici blokirani
      // 5 minut — adapter to spoštuje z negativnim predpomnilnikom 310 s.
      throw new GygApiError("rate-limited", "HTTP 429", { status: 429 });
    }
    if (res.status === 401) {
      throw new GygApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      // tier nima dostopa do endpointa (Access-levels wiki) — kot server
      // odpoved v telemetriji, a ločena vrsta (ne tolčemo 60 s ampak 310 s?
      // NE — 403 je stabilna konfiguracija, NE začasna; 60 s zadostuje).
      throw new GygApiError("server", "HTTP 403", { status: 403 });
    }
    if (res.status === 404) {
      throw new GygApiError("not-found", "HTTP 404", { status: 404 });
    }
    if (res.status === 400) {
      throw new GygApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new GygApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new GygApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new GygApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * GET /1/tours — iskanje po geografskih koordinatah (pogodba:
   * coordinates[] = [lat, lng, radius], medsebojno izključno s q).
   * cnt_language=en + currency=EUR na VSAKEM klicu (stateless pogodba);
   * preformatted=teaser deluje na VSAKEM tierju (BASIC podpira SAMO teaser).
   */
  async searchTours(
    p: GygToursSearchParams,
    opts: { signal?: AbortSignal } = {}
  ): Promise<GygToursResponse> {
    const params = new URLSearchParams();
    // Pogodba: explode array → coordinates[]=lat&coordinates[]=lng&…
    // (URLSearchParams samodejno zakodira oglate oklepaje %5B%5D — vir
    // sprejema oboje; izrecno pošiljamo pogodbene [] oblike.)
    for (const c of p.coordinates) {
      params.append("coordinates[]", String(c));
    }
    params.set("cnt_language", "en"); // sl NI podprt (dokumentirano)
    params.set("currency", "EUR");
    params.set("preformatted", "teaser"); // tier-varno (BASIC: samo teaser)
    params.set("limit", String(p.limit));
    params.set("offset", "0");
    params.set("sortfield", p.sortfield ?? "popularity");
    // Datum uporabnika → pogodbeno okno date[] (»tours that are offered on
    // date or between dates«) — 00:00:00–23:59:59 izbranega dne.
    if (p.date) {
      params.append("date[]", `${p.date}T00:00:00`);
      params.append("date[]", `${p.date}T23:59:59`);
    }

    const raw = await this.get("/1/tours", params, opts.signal);
    const body = raw as Partial<GygToursResponse>;
    if (
      !body ||
      typeof body !== "object" ||
      !body.data ||
      typeof body.data !== "object" ||
      !Array.isArray(body.data.tours)
    ) {
      throw new GygApiError("invalid-response", "tours-shape");
    }
    return body as GygToursResponse;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; klient-varno — samo boolean/dejanski
// klient ostaja v route handlerjih)
// ---------------------------------------------------------------------------

/** Dejanski žeton (strežniško) ali null, če NI konfiguriran. */
export function gygApiTokenFromEnv(): string | null {
  const token = process.env.GETYOURGUIDE_API_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

/** Base URL iz env (test preklop) ali produkcija (brez končnih /). */
export function gygBaseUrlFromEnv(): string {
  const base = process.env.GETYOURGUIDE_API_BASE?.trim().replace(/\/+$/, "");
  return base && base.length > 0 ? base : GYG_DEFAULT_BASE;
}
